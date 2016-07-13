'use strict';

chrome.browserAction.onClicked.addListener(onAction);
chrome.commands.onCommand.addListener(onCommand);

function onCommand (command) {
  if (command === 'toggle-popup') {
    postToContent({ command: 'toggle-popup' });
  }
}

function onAction (tab) {
  postToContent({ command: 'toggle-popup' });
}

function postToContent (data) {
  chrome.tabs.query({ active: true, currentWindow: true }, gotTabs);
  function gotTabs (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, data);
  }
}
