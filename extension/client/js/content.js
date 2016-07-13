'use strict';

var ext = chrome.extension.getURL('/').slice(0, -1);
var frame = null;

window.addEventListener('message', readFrameMessage);
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
  frame.src = chrome.extension.getURL('/popup.html?url=' + encodeURIComponent(location.href));
  frame.onload = autosizeFrame;

  css(frame)
    .set('position', 'fixed')
    .set('right', '0')
    .set('bottom', '0')
    .set('border', 'none')
    .set('width', '500px')
    .set('max-height', '90%')
    .set('z-index', '9999999');

  document.body.appendChild(frame);
}

function removeFrame () {
  if (frame) {
    frame.parentElement.removeChild(frame);
    frame = null;
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
