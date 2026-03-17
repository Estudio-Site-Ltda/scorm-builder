// SCORM 1.2 API Shim
var API = null;

function findAPI(win) {
  var searchCount = 0;
  while (win.API == null && win.parent != null && win.parent != win) {
    searchCount++;
    if (searchCount > 7) return null;
    win = win.parent;
  }
  return win.API;
}

function getAPI() {
  if (API != null) return API;
  API = findAPI(window);
  if (API == null && window.opener != null) {
    API = findAPI(window.opener);
  }
  return API;
}

function LMSInitialize() {
  var api = getAPI();
  if (api) return api.LMSInitialize('');
  return 'false';
}

function LMSSetValue(element, value) {
  var api = getAPI();
  if (api) return api.LMSSetValue(element, value);
  return 'false';
}

function LMSGetValue(element) {
  var api = getAPI();
  if (api) return api.LMSGetValue(element);
  return '';
}

function LMSCommit() {
  var api = getAPI();
  if (api) return api.LMSCommit('');
  return 'false';
}

function LMSFinish() {
  var api = getAPI();
  if (api) return api.LMSFinish('');
  return 'false';
}
