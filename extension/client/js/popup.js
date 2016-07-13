'use strict';
var $ = require('dominus');
var raf = require('raf');
var debounce = require('lodash/debounce');
var omnibox = require('omnibox/querystring');
var markdownService = require('../../../../ponyfoo/services/markdown');
var weeklyCompilerService = require('../../../../ponyfoo/services/weeklyCompiler');
var env = require('./environment.json');
var rprotocol = /^https?:\/\/(www\.)?/i;
var swappers = [];
var updatePreviewSlowly = raf.bind(null, debounce(updatePreview.bind(null, null), 100));
var postHeightToContentSlowly = raf.bind(null, debounce(postHeightToContent, 100));
var submitterCached = null;
var q = omnibox.parse(location.search.slice(1));
var url = q.url;

$('.ss-url').text(prettifyUrl(url)).attr('data-url', url);
$('.pp-close').on('click', closePopup);
$('.pp-minimize').on('click', () => popupMinimization(true));
$('.pp-maximize').on('click', () => popupMinimization(false));

on(window, 'message', readContentMessage);
on(document, 'DOMContentLoaded', loaded);
$('textarea').on('resize', postHeightToContentSlowly);

function loaded () {
  getBestStorage().get(['submitter'], ready);
}

function popupMinimization (state) {
  var on = state ? 'addClass' : 'removeClass';
  var off = state ? 'removeClass' : 'addClass';
  $('body')[on]('pm-no-overflow');
  $('.pp-minimize')[on]('uv-hidden');
  $('.pp-maximize')[off]('uv-hidden');
  $('.pm-main')[on]('pm-minimized');
  postToContent({ command: 'minimize', state });
  postHeightToContent();
}

function readContentMessage (e) {
  var data = readEventData(e.data);
  if (!data) {
    return;
  }
  if (data.command === 'minimize') {
    popupMinimization(data.state);
  }
  if (data.command === 'ask-to-resize') {
    postHeightToContent();
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
  var hasSubmitter = 'submitter' in items;
  if (!hasSubmitter) {
    readySubmitter({});
  } else {
    submitterCached = items.submitter;
    showSubmission();
  }

  $('.tt-save').on('click', saveSubmitter);
  $('.tt-cancel').on('click', showSubmission);
  $('.fx-back').on('click', showSubmissionSection);
  $('.ss-profile').on('click', showSubmitter);
  $('.ss-submit').on('click', submit);

  $('.ss-details')
    .on('change keypress keydown paste input', '.wa-link-image', updateThumbnailImage)
    .on('change keypress keydown paste input', 'input,textarea,select', updatePreviewSlowly);
}

function closePopup () {
  postToContent({ command: 'close-popup' });
}

function postToContent (data) {
  parent.postMessage(JSON.stringify(data), '*');
}

function noop () {}

function showSubmitter () {
  getBestStorage().get(['submitter'], readySubmitter);
}

function readySubmitter (items) {
  var hasSubmitter = 'submitter' in items;
  var submitter = items.submitter;
  $('.st-section').addClass('uv-hidden');
  $('.tt-details').removeClass('uv-hidden');
  $('.tt-cancel')[hasSubmitter ? 'removeClass' : 'addClass']('uv-hidden');
  $('#tt-name').value(hasSubmitter ? submitter.name : '');
  $('#tt-email').value(hasSubmitter ? submitter.email : '');
  postHeightToContent();
}

function saveSubmitter () {
  var name = $('#tt-name').value();
  var email = $('#tt-email').value();
  var submitter = submitterCached = {
    name: name,
    email: email
  };
  var changes = { submitter: submitter };
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
  fetch(env.serviceAuthority + '/api/metadata/scrape?url=' + encodeURIComponent(url))
    .then(response => response.json())
    .then(data => scraped(url, data))
    .catch(err => scrapeFailed(err));
}

function text (el, value) {
  if (arguments.length === 2) {
    el.textContent = el.innerText = value;
  }
  return el.textContent || el.innerText;
}

function getCurrentTabUrl (done) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };
  chrome.tabs.query(queryInfo, queriedTabs);

  function queriedTabs (tabs) {
    var tab = tabs[0];
    var url = tab.url;
    done(url);
  }
}

function on (el, type, fn) {
  el.addEventListener(type, fn);
}

function noop () {}

function updateThumbnailImage () {
  var $container = $('.ss-details');
  updateThumbnail($container);
}

function scraped (url, data) {
  var $container = $('.ss-details');
  var firstImage = data.images && data.images[0] || '';
  var description = (data.description || '').trim();
  var sourceHref = 'https://twitter.com/' + (data.twitter ? data.twitter.slice(1) : '');
  var imageInput = $('.wa-link-image', $container);
  var imageInputContainer = $('.wa-link-image-container', $container);

  updateInputs();
  updateImageSwapper();
  updateThumbnail($container);
  updatePreview();

  function updateInputs () {
    $('.wa-link-title', $container).value(data.title || prettifyUrl(url));
    $('.wa-link-description', $container).value(description);
    $('.wa-link-source', $container).value(data.source || '');
    $('.wa-link-source-href', $container).value(sourceHref);
    $('.wa-link-image', $container).value(firstImage);
  }

  function updateImageSwapper () {
    var swapper = data.images.length > 1;
    if (swapper) {
      swapperOn();
    } else {
      swapperOff();
    }
  }

  function swapperOff () {
    var toggler = $('.wa-toggler', imageInputContainer);
    swapperOffEvent(toggler);
  }

  function swapperOn () {
    var toggler = $('.wa-toggler', imageInputContainer);
    var togglerLeft = $('.wa-link-image-left', imageInputContainer);
    var togglerRight = $('.wa-link-image-right', imageInputContainer);
    var index = 0;

    swapperOffEvent(toggler);
    togglerLeft.addClass('wa-toggler-off');
    togglerRight.removeClass('wa-toggler-off');

    swapperOnEvent(toggler, swap);

    function swap (e) {
      var $el = $(e.target);
      if ($el.hasClass('wa-toggler-off')) {
        return;
      }
      var left = e.target === togglerLeft[0];
      index += left ? -1 : 1;
      imageInput.value(data.images[index] || '');
      invalidate(-1, togglerLeft);
      invalidate(1, togglerRight);
      updateThumbnail($container);
      updatePreview();
    }

    function invalidate (offset, $el) {
      var on = typeof data.images[index + offset] === 'string';
      var op = on ? 'removeClass' : 'addClass';
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
    var swapper = findSwapper();
    toggler
      .addClass('uv-hidden')
      .off('click', swapper && swapper.fn);
    function findSwapper () {
      for (var i = 0; i < swappers.length; i++) {
        if ($(swappers[i].toggler).but(toggler).length === 0) {
          return swappers.splice(i, 1)[0];
        }
      }
    }
  }
}

function updateThumbnail ($container) {
  var $image = $('.wa-link-image', $container);
  var $imagePreview = $('.wa-link-image-preview', $container);
  var imageValue = $image.value().trim();

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
  var $container = $('.ss-details');
  var linkImageContainer = $('.wa-link-image-container', $container);
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
  var endpoint = env.serviceAuthority + '/api/weeklies/submissions';
  var opts = {
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
    var list = $('.fx-messages');
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

  var section = getSectionModel();
  var options = {
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

  function renderError (err) {
    console.log('The error was:', err);
    render('<pre class="wa-error">' + parseError(err) + '</pre>');
  }

  function parseError (err) {
    var text = String(err.stack || err.message || err);
    var rextensionurl = /[a-z]*-?extension:\/\/[a-z]+/ig;
    return text.replace(rextensionurl, 'ext://');
  }

  function render (html) {
    $('.wu-preview-link').html(html);
    postHeightToContent();
  }
}

function getBestStorage () {
  return chrome.storage.sync || chrome.storage.local;
}

function prettifyUrl (url) {
  var rextensionurl = /^[a-z]*-?extension:\/\/[a-z]+/i;
  var rtrailingslash = /\/$/;
  return url
    .replace(rprotocol, '')
    .replace(rextensionurl, '')
    .replace(rtrailingslash, '');
}
