const child_process = require('child_process');
const ChromeLauncher = require('chrome-launcher');
const ChromeRemoteInterface = require('chrome-remote-interface');
const debug = require('debug')('horseman:headless');
const networkDebug = require('debug')('horseman:headless:network');
const consoleDebug = require('debug')('horseman:headless:console');

let launcher;
let Chrome;
var eventHandlers = {};
let Page;
let Network;
let Security;
let Log;
let Runtime;
let windowWidth;
let windowHeight;

const userDataPath = `${process.cwd()}/CHROME`;
let logPathsArr = [];
logPathsArr.push(`${userDataPath}/chrome-err.log`);
logPathsArr.push(`${userDataPath}/chrome-out.log`);

const logPaths = function() {
  return logPathsArr;
}

const startChrome = function() {
  child_process.execSync(`mkdir -p ${userDataPath}`);
  return ChromeLauncher.launch({
    port: 9222,
    chromeFlags: [
      `--window-size=${windowWidth},${windowHeight}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.78 Safari/537.36',
      '--remote-debugging-address=0.0.0.0',
      '--no-sandbox', // needed for Docker :-(
      '--no-zygote', // needed for Docker :-(
      '--headless'
    ],
    handleSIGINT: false,
    logLevel: 'verbose',
    userDataDir: userDataPath
  });
}

function onConsole(e) {
  for (argIndex in e.args) {
    let arg = e.args[argIndex];
    if (arg.type === 'string') {
      consoleDebug(`${arg.value}`);      
    }
  }
}

function onScreencast(e) {
  // debug('onScreencast');
  // There's a wee race when tearing down: don't sent ack to a dead chrome.
  if (Page) {    
    Page.screencastFrameAck({sessionId: e.sessionId})
    .catch((err) => {
      debug(`onScreencastAck: `, err);
    });
  }
  if (eventHandlers.screencast) {
    eventHandlers.screencast(e);
  }
}

function onException(e) {
  // I haven't seen this yet, so it hasn't been formatted properly
  debug("remote Exception Event", e);
}

function onNetworkRequestBegin(e) {
  networkDebug(`${e.request.method} ${e.request.url}`);
}

function onNetworkRequestResponse(e) {
  networkDebug(`${e.response.url}: ${e.response.status} ${e.response.statusText}`);
}

const setupRemoteHooks = async function(remoteChrome) {
  Page = remoteChrome.Page;
  Runtime = remoteChrome.Runtime;
  Log = remoteChrome.Log;
  Security = remoteChrome.Security;
  Network = remoteChrome.Network;
  
  await Promise.all([
    Network.enable(),
    Page.enable(),
    Security.enable(),
    Log.enable(),
    Runtime.enable()
  ]);
  
  // bypass SSL security errors
  await Security.setOverrideCertificateErrors({override: true});
  remoteChrome.on("Security.certificateError", (e) => {
    debug("onSecurityCertificateError", e);
    Security.handleCertificateError({
      eventId: e.eventId,
      action: 'continue'
    })
  });
  
  remoteChrome.on("Runtime.consoleAPICalled", onConsole);
  remoteChrome.on("Page.screencastFrame", onScreencast);
  remoteChrome.on("Network.requestWillBeSent", onNetworkRequestBegin);
  remoteChrome.on("Network.responseReceived", onNetworkRequestResponse);
}

const launch = async function(url, width, height) {
  windowWidth = width;
  windowHeight = height;
  try {
    launcher = await startChrome();
    Chrome = await ChromeRemoteInterface();
    await setupRemoteHooks(Chrome);
    debug(`navigate to url ${url}`);
    await Page.navigate({url: url});
    await Page.loadEventFired();
    debug(`page loaded`);
    await Page.startScreencast({
      format: "jpeg",
      quality: 100
    });
    debug("screencast started");
  } catch (e) {
    debug('failed to launch chrome', e);
    return;
  }
}

const kill = async function() {
  try {
    if (Chrome) {
      Page = null;
      await Chrome.close();
    }
    await launcher.kill();
  } catch (e) {
    debug(`kill: `, e);
  }
}

const onScreencastFrame = function(handler) {
  eventHandlers.screencast = handler;
}

module.exports = {
  launch,
  kill,
  logPaths,
  onScreencastFrame
}