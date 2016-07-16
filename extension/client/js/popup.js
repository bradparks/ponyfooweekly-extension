'use strict';

const $ = require('dominus');
const xhr = require('xhr');
const raf = require('raf');
const assign = require('assignment');
const woofmark = require('woofmark');
const bureaucracy = require('bureaucracy');
const debounce = require('lodash/debounce');
const omnibox = require('omnibox/querystring');
const markdownService = require('../../../../ponyfoo/services/markdown');
const weeklyCompilerService = require('../../../../ponyfoo/services/weeklyCompiler');
const env = require('./environment.json');
const rprotocol = /^https?:\/\/(www\.)?/i;
const swappers = [];
const updatePreviewSlowly = raf.bind(null, debounce(updatePreview.bind(null, null), 100));
const postHeightToContentSlowly = raf.bind(null, debounce(postHeightToContent, 100));
const q = omnibox.parse(location.search.slice(1));
const url = q.url;
const xhrDefaults = {
  headers: { Accept: 'application/json' }
};
let submitterCached = null;
let pickerTarget = null;

$('.ss-url').text(prettifyUrl(url)).attr('data-url', url);
$('.pp-close').on('click', closePopup);
$('.pp-minimize').on('click', () => popupMinimization(true));
$('.pp-maximize').on('click', () => popupMinimization(false));
textareas();

on(window, 'message', readContentMessage);
on(document, 'DOMContentLoaded', loaded);
on(document, 'keydown', readKey);

$('textarea').on('resize', postHeightToContentSlowly);

function loaded () {
  getBestStorage().get(['submitter'], ready);
}

function popupMinimization (state) {
  const on = state ? 'addClass' : 'removeClass';
  const off = state ? 'removeClass' : 'addClass';
  $('body')[on]('pm-no-overflow');
  $('.pp-minimize')[on]('uv-hidden');
  $('.pp-maximize')[off]('uv-hidden');
  $('.pm-main')[on]('pm-minimized');
  postToContent({ command: 'minimize', state });
  postHeightToContent();
}

function readContentMessage ({ data }) {
  const { command, state, value } = readEventData(data) || {};
  if (!command) {
    return;
  }
  if (command === 'minimize') {
    popupMinimization(state);
  }
  if (command === 'ask-to-resize') {
    postHeightToContent();
  }
  if (command === 'has-picked') {
    completeFromPicker(value);
  }
  if (command === 'has-picked-title') {
    completeFromPicker(value);
  }
  if (command === 'cancel-pick') {
    cancelMagicPick();
  }
}

function readEventData (data) {
  try {
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function postHeightToContent () {
  postToContent({ command: 'resize', height: document.body.scrollHeight });
}

function ready (items) {
  const hasSubmitter = 'submitter' in items;
  if (!hasSubmitter) {
    readySubmitter({});
  } else {
    submitterCached = items.submitter;
    showSubmission();
  }

  const imageInput = $('.wa-link-image');
  const imageUpload = $.findOne('.fm-browse-image-input');
  const bureaucrat = bureaucracy.setup(imageUpload, {
    endpoint: env.serviceAuthority + '/api/images'
  });
  bureaucrat.on('valid', () => loader());
  bureaucrat.on('ended', () => loader('done'));
  bureaucrat.on('error', err => {
    if (err) {
      renderError(err);
    }
    loader('done');
  });
  bureaucrat.on('success', receivedImages);

  function receivedImages ([result]) {
    if (!result) {
      return;
    }
    imageInput.value(result.href);
    updateThumbnail();
    updatePreview();
  }

  $('.tt-save').on('click', saveSubmitter);
  $('.tt-cancel').on('click', showSubmission);
  $('.fx-back').on('click', showSubmissionSection);
  $('.ss-profile').on('click', showSubmitter);
  $('.ss-submit').on('click', submit);

  $('.ss-details')
    .on('change keypress keydown paste input', '.wa-link-image', updateThumbnail)
    .on('change keypress keydown paste input', 'input,textarea,select', updatePreviewSlowly);

  $('.fm-picker').on('click', beginMagicPick);
  $('.fm-title-picker').on('click', beginTitleMagicPick);
}

function closePopup () {
  postToContent({ command: 'close-popup' });
}

function beginMagicPick (e) {
  const button = $(e.target);
  pickerTarget = button.parents('.fm-field').find('input,textarea');
  postToContent({
    command: 'begin-pick',
    options: {
      selector: button.attr('data-selector'),
      attr: button.attr('data-attr')
    }
  });
}

function beginTitleMagicPick () {
  pickerTarget = $('.wa-link-title');
  postToContent({ command: 'ask-for-title' });
}

function completeFromPicker (value) {
  if (pickerTarget) {
    pickerTarget.value(value);
    pickerTarget = null;
    updateThumbnail();
    updatePreview();
  }
}

function cancelMagicPick () {
  pickerTarget = null;
}

function postToContent (data) {
  parent.postMessage(JSON.stringify(data), '*');
}

function noop () {}

function showSubmitter () {
  getBestStorage().get(['submitter'], readySubmitter);
}

function readySubmitter (items) {
  const hasSubmitter = 'submitter' in items;
  const submitter = items.submitter;
  $('.st-section').addClass('uv-hidden');
  $('.tt-details').removeClass('uv-hidden').find('input,textarea').focus();
  $('.tt-cancel')[hasSubmitter ? 'removeClass' : 'addClass']('uv-hidden');
  $('#tt-name').value(hasSubmitter ? submitter.name : '');
  $('#tt-email').value(hasSubmitter ? submitter.email : '');
  postHeightToContent();
}

function saveSubmitter () {
  const name = $('#tt-name').value();
  const email = $('#tt-email').value();
  const submitter = submitterCached = {
    name: name,
    email: email
  };
  const changes = { submitter: submitter };
  getBestStorage().set(changes, showSubmission);
}

function showSubmission () {
  showSubmissionSection();
  scrapeTab();
}

function showSubmissionSection () {
  $('.st-section').addClass('uv-hidden');
  $('.ss-details').removeClass('uv-hidden');
  postHeightToContent();
}

function scrapeTab () {
  loader();
  fetch(env.serviceAuthority + '/api/metadata/scrape?url=' + encodeURIComponent(url))
    .then(response => response.json())
    .then(data => {
      scraped(url, data);
      loader('done');
    })
    .catch(err => {
      scrapeFailed(err);
      loader('done');
    });
}

function loader (state) {
  const addWhileLoading = state !== 'done' ? 'addClass' : 'removeClass';
  const removeWhileLoading = state !== 'done' ? 'removeClass' : 'addClass';
  $('.ss-detail-fields')[addWhileLoading]('uv-hidden');
  $('.ss-detail-loading')[removeWhileLoading]('uv-hidden');
  postHeightToContent();
}

function text (el, value) {
  if (arguments.length === 2) {
    el.textContent = el.innerText = value;
  }
  return el.textContent || el.innerText;
}

function getCurrentTabUrl (done) {
  const queryInfo = {
    active: true,
    currentWindow: true
  };
  chrome.tabs.query(queryInfo, queriedTabs);

  function queriedTabs (tabs) {
    const tab = tabs[0];
    const url = tab.url;
    done(url);
  }
}

function on (el, type, fn) {
  el.addEventListener(type, fn);
}

function noop () {}

function scraped (url, data) {
  const $container = $('.ss-details');
  const firstImage = data.images && data.images[0] || '';
  const description = (data.description || '').trim();
  const sourceHref = 'https://twitter.com/' + (data.twitter ? data.twitter.slice(1) : '');
  const imageInput = $('.wa-link-image', $container);
  const imageInputContainer = $('.wa-link-image-container', $container);

  updateInputs();
  updateImageSwapper();
  updateThumbnail();
  updatePreview();

  setTimeout(focus, 0);

  function focus () {
    $container.find('input,textarea').focus();
  }

  function updateInputs () {
    $('.wa-link-title', $container).value(data.title || prettifyUrl(url));
    $('.wa-link-description', $container).value(description);
    $('.wa-link-source', $container).value(data.source || '');
    $('.wa-link-source-href', $container).value(sourceHref);
    $('.wa-link-image', $container).value(firstImage);
  }

  function updateImageSwapper () {
    const swapper = data.images.length > 1;
    if (swapper) {
      swapperOn();
    } else {
      swapperOff();
    }
  }

  function swapperOff () {
    const toggler = $('.wa-link-image-left,.wa-link-image-right', imageInputContainer);
    swapperOffEvent(toggler);
  }

  function swapperOn () {
    const toggler = $('.wa-link-image-left,.wa-link-image-right', imageInputContainer);
    const togglerLeft = $('.wa-link-image-left', imageInputContainer);
    const togglerRight = $('.wa-link-image-right', imageInputContainer);
    let index = 0;

    swapperOffEvent(toggler);
    togglerLeft.addClass('wa-toggler-off');
    togglerRight.removeClass('wa-toggler-off');

    swapperOnEvent(toggler, swap);

    function swap (e) {
      const $el = $(e.target);
      if ($el.hasClass('wa-toggler-off')) {
        return;
      }
      const left = e.target === togglerLeft[0];
      index += left ? -1 : 1;
      imageInput.value(data.images[index] || '');
      invalidate(-1, togglerLeft);
      invalidate(1, togglerRight);
      updateThumbnail();
      updatePreview();
    }

    function invalidate (offset, $el) {
      const on = typeof data.images[index + offset] === 'string';
      const op = on ? 'removeClass' : 'addClass';
      $el[op]('wa-toggler-off');
    }
  }

  function swapperOnEvent (toggler, swap) {
    toggler
      .removeClass('uv-hidden')
      .on('click', swap);
    swappers.push({ toggler: toggler, fn: swap });
  }

  function swapperOffEvent (toggler) {
    const swapper = findSwapper();
    toggler
      .addClass('uv-hidden')
      .off('click', swapper && swapper.fn);
    function findSwapper () {
      for (let i = 0; i < swappers.length; i++) {
        if ($(swappers[i].toggler).but(toggler).length === 0) {
          return swappers.splice(i, 1)[0];
        }
      }
    }
  }
}

function updateThumbnail () {
  const $container = $('.ss-details');
  const $image = $('.wa-link-image', $container);
  const $imagePreview = $('.wa-link-image-preview', $container);
  const imageValue = $image.value().trim();

  $imagePreview.attr('src', imageValue);

  if (imageValue.length) {
    $imagePreview.removeClass('uv-hidden');
  } else {
    $imagePreview.addClass('uv-hidden');
  }
}

function scrapeFailed (value) {
  updatePreview(value);
}

function getSectionModel () {
  const $container = $('.ss-details');
  const linkImageContainer = $('.wa-link-image-container', $container);
  return {
    type: 'link',
    subtype: 'suggestion',
    title: $('.wa-link-title', $container).value(),
    href: $('.ss-url').attr('data-url'),
    foreground: '#1bc211',
    background: 'transparent',
    source: $('.wa-link-source', $container).value(),
    sourceHref: $('.wa-link-source-href', $container).value(),
    image: linkImageContainer.but('.uv-hidden').find('.wa-link-image').value(),
    sponsored: false,
    tags: [],
    description: $('.wa-link-description', $container).value()
  };
}

function getModel () {
  return {
    submitter: {
      name: submitterCached ? submitterCached.name : null,
      email: submitterCached ? submitterCached.email : null,
      comment: $('.wa-submitter-comments').value()
    },
    section: getSectionModel()
  };
}

function submit () {
  const endpoint = env.serviceAuthority + '/api/weeklies/submissions';
  const opts = {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(getModel())
  };
  fetch(endpoint, opts)
    .then(response => response.json())
    .then(fetchSuccess)
    .catch(fetchFailure);
  function fetchSuccess (data) {
    if (data && data.messages) {
      failed(data.messages); return;
    }
    $('.st-section').addClass('uv-hidden');
    $('.sx-success').removeClass('uv-hidden');
    postHeightToContent();
  }
  function fetchFailure (reason) {
    console.log('The error was:', reason);
    failed(['An unknown error occured. Please try again!']);
  }
  function failed (messages) {
    $('.st-section').addClass('uv-hidden');
    $('.fx-failure').removeClass('uv-hidden');
    const list = $('.fx-messages');
    list.find('li').remove();
    messages.forEach(message => $('<li>')
      .text(message)
      .appendTo(list)
    );
    postHeightToContent();
  }
}

function updatePreview (err) {
  if (err) {
    renderError(err); return;
  }

  const section = getSectionModel();
  const options = {
    markdown: markdownService,
    slug: 'extension-preview'
  };

  weeklyCompilerService.compile([section], options, compiled);

  function compiled (err, html) {
    if (err) {
      renderError(err); return;
    }
    render(html);
  }
}

function renderError (err) {
  console.log('The error was:', err);
  render('<pre class="wa-error">' + parseError(err) + '</pre>');
}

function parseError (err) {
  const text = String(err.stack || err.message || err);
  const rextensionurl = /[a-z]*-?extension:\/\/[a-z]+/ig;
  return text.replace(rextensionurl, 'ext://');
}

function render (html) {
  $('.wu-preview-link').html(html);
  postHeightToContent();
}

function getBestStorage () {
  return chrome.storage.sync || chrome.storage.local;
}

function prettifyUrl (url) {
  const rextensionurl = /^[a-z]*-?extension:\/\/[a-z]+/i;
  const rtrailingslash = /\/$/;
  return url
    .replace(rprotocol, '')
    .replace(rextensionurl, '')
    .replace(rtrailingslash, '');
}

function readKey (e = window.event) {
  const esc = wasEscape(e);
  if (esc) {
    if (pickerTarget) {
      postToContent({ command: 'cancel-pick' });
    } else {
      closePopup();
    }
    return;
  }
  const enter = wasEnter(e);
  if (enter) {
    if (!$('.tt-details').hasClass('uv-hidden')) {
      saveSubmitter();
    }
  }
}

function wasEscape ({ key, keyCode }) {
  return key === 'Escape' || keyCode === 27;
}

function wasEnter ({ key, keyCode }) {
  return key === 'Enter' || keyCode === 13;
}

function textareas (container) {
  $('.wk-textarea', container).forEach(convert);

  function convert (el) {
    var wel = $(el)
    var hasHtml = wel.hasClass('wk-html');
    var hasWysiwyg = wel.hasClass('wk-wysiwyg');
    var editor = woofmark(el, {
      parseMarkdown: markdownService.compile,
      classes: {
        wysiwyg: 'md-markdown',
        prompts: {
          dropicon: 'fa fa-upload'
        },
        dropicon: 'fa fa-upload'
      },
      render: {
        modes: renderModes,
        commands: renderCommands
      },
      images: {
        url: env.serviceAuthority + '/api/images',
        restriction: 'GIF, JPG, and PNG images'
      },
      xhr: ajax,
      html: hasHtml,
      wysiwyg: hasWysiwyg
    });

    function ajax (options, done) {
      xhr(assign({}, xhrDefaults, options), response);
      function response (err, res, body) {
        res.body = body = JSON.parse(body);
        done(err, res, body);
      }
    }

    function renderModes (el, id) {
      var icons = {
        markdown: 'file-text-o',
        html: 'file-code-o',
        wysiwyg: 'eye'
      };
      renderIcon(el, icons[id] || id);
    }

    function renderCommands (el, id) {
      var icons = {
        quote: 'quote-right',
        ul: 'list-ul',
        ol: 'list-ol',
        heading: 'header',
        image: 'picture-o',
        attachment: 'paperclip'
      };
      renderIcon(el, icons[id] || id);
    }

    function renderIcon (el, icon) {
      $(el).addClass('wk-command-' + icon)
      $('<i>').addClass('fa fa-' + icon).appendTo(el);
    }
  }
}
