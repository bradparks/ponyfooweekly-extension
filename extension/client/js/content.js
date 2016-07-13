'use strict';

const $ = require('dominus');
const insertRule = require('insert-rule');
const ext = chrome.extension.getURL('/').slice(0, -1);
const z = {
  popup: 9999999,
  shade: 9999998
};
const rules = {
  '.pfw-has-shade *': {
    cursor: 'crosshair !important'
  },
  '.pfw-has-shade .pfw-frame': {
    cursor: 'initial !important'
  }
};
let frame = null;
let shade = null;
let shadeOptions = null;

insertRules(rules);
window.addEventListener('message', readFrameMessage);
document.addEventListener('keydown', readKey);
chrome.extension.onMessage.addListener(readBackgroundMessage);

function readFrameMessage (e) {
  var eventOrigin = e.origin || e.originalEvent.origin;
  if (eventOrigin !== ext) {
    return;
  }
  var data = readEventData(e.data);
  if (!data) {
    return;
  }
  processMessage(data.command, data);
}

function readBackgroundMessage (data) {
  if (!data) {
    return;
  }
  processMessage(data.command, data);
}

function processMessage (command, data) {
  if (command === 'close-popup') {
    removeFrame();
  }
  if (command === 'open-popup') {
    createFrame();
  }
  if (command === 'toggle-popup') {
    if (frame) {
      tellFrameToTellMeToMinimize();
    } else {
      createFrame();
    }
  }
  if (command === 'minimize') {
    minimizeFrame(data.state);
  }
  if (command === 'resize') {
    resizeFrame(data.height);
  }
  if (command === 'begin-pick') {
    createShade(data.options);
  }
  if (command === 'ask-for-title') {
    postToFrame({ command: 'has-picked', value: document.title });
  }
}

function tellFrameToTellMeToMinimize () {
  var shouldMinimize = !frame.classList.contains('pfw-minimized');
  postToFrame({ command: 'minimize', state: shouldMinimize });
}

function postToFrame (data) {
  if (frame) {
    frame.contentWindow.postMessage(JSON.stringify(data), '*');
  }
}

function minimizeFrame (minimized) {
  if (frame) {
    frame.classList[minimized ? 'add' : 'remove']('pfw-minimized');
  }
}

function autosizeFrame () {
  postToFrame({ command:'ask-to-resize' });
}

function resizeFrame (height) {
  if (frame) {
    frame.style.height = height + 'px';
  }
}

function createFrame () {
  if (frame) {
    removeFrame();
  }
  frame = document.createElement('iframe');
  frame.className = 'pfw-frame';
  frame.src = chrome.extension.getURL('/popup.html?url=' + encodeURIComponent(location.href));
  frame.onload = autosizeFrame;

  css(frame)
    .set('position', 'fixed')
    .set('right', '0')
    .set('bottom', '0')
    .set('border', 'none')
    .set('width', '500px')
    .set('max-width', '50%')
    .set('max-height', '90%')
    .set('z-index', z.popup);

  document.body.appendChild(frame);
}

function removeFrame () {
  if (frame) {
    frame.parentElement.removeChild(frame);
    frame = null;
    removeShade();
  }
}

function readEventData (data) {
  try {
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function css (el) {
  var api = {
    set: set
  };
  return api;

  function set (prop, value) {
    el.style[prop] = value;
    return api;
  }
}

function removeShade () {
  if (shade) {
    shade.parentElement.removeChild(shade);
    shade = shadeOptions = null;
    document.body.removeEventListener('mouseover', shadeover);
    document.body.removeEventListener('click', shadeclick);
    document.body.classList.remove('pfw-has-shade');
    postToFrame({ command: 'end-pick' });
  }
}

function createShade (options) {
  if (shade) {
    removeShade();
  }
  shade = document.createElement('iframe');
  shadeOptions = options;

  css(shade)
    .set('position', 'absolute')
    .set('pointer-events', 'none')
    .set('z-index', z.shade)
    .set('opacity', '0.25')
    .set('background-color', '#1686a2');

  document.body.appendChild(shade);
  document.body.addEventListener('mouseover', shadeover);
  document.body.addEventListener('click', shadeclick);
  document.body.classList.add('pfw-has-shade');
}

function shadeover (e) {
  var el = e.target;
  if (el === frame) {
    return;
  }
  var scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
  var scrollLeft = document.body.scrollLeft || document.documentElement.scrollLeft;
  var rect = el.getBoundingClientRect();

  css(shade)
    .set('top', scrollTop + rect.top + 'px')
    .set('left', scrollLeft + rect.left + 'px')
    .set('width', rect.width + 'px')
    .set('height', rect.height + 'px');
}

function shadeclick (e) {
  var el = e.target;
  if (el === frame) {
    return;
  }
  const value = getValue($(el));
  postToFrame({ command: 'has-picked', value });
  e.preventDefault();
  e.stopPropagation();
  removeShade();
}

function getValue (el) {
  let target = el;
  if (shadeOptions.selector && !el.is(shadeOptions.selector)) {
    target = el.find(shadeOptions.selector);
  }
  if (shadeOptions.attr) {
    return target.attr(shadeOptions.attr);
  }
  return target.text();
}

function readKey (e = window.event) {
  var esc = wasEscape(e);
  if (esc) {
    if (shade) {
      removeShade();
    } else if (frame) {
      removeFrame();
    }
  }
}

function wasEscape (e) {
  if ('key' in e) {
    return e.key === 'Escape';
  }
  return e.keyCode === 27;
}

function insertRules (rules) {
  Object.keys(rules).forEach(selector =>
    insertRule(selector, rules[selector])
  );
}
