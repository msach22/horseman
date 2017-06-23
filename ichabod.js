const child_process = require('child_process');
const fs = require('fs');
let ichabod_path = process.env.ICHABOD;
let ichabod_pid;
let ichabod;

let interruptSelf = function() {
  process.kill(process.pid, 'SIGINT');
}

try {
  ichabod_pid = child_process.execSync('pgrep ichabod');
} catch (e) { }

function spawn() {
  console.log(`attempting launch of subprocess ichabod ${ichabod_path}`);
  //const out = fs.openSync('./ichabod.log', 'a');
  ichabod = child_process.spawn(ichabod_path, [] /* ichabod args */, {
    detached: false,
    stdio: [ 'ignore', 'pipe', 'pipe' ]
  });
  ichabod.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  ichabod.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });
  ichabod.on('close', (code) => {
    console.log(`child ichabod exited with code ${code}`);
    ichabod_pid = false;
    interruptSelf();
  });
  ichabod_pid = ichabod.pid;
}

if (!ichabod_path) {
  try {
    ichabod_path = child_process.execSync('which ichabod');
  } catch (e) { }
}

if (!ichabod_pid && !ichabod_path) {
  console.log(`no running ichabod and no known binary. `+
    `this aggression will not stand, man.`);
  process.exit(1);
}

let launch = function() {
  if (ichabod_pid) {
    console.log(`found existing ichabod ${ichabod_pid}`);
  } else {
    spawn();
  }
}

let interrupt = function() {
  try {
    process.kill(ichabod_pid, 2);
  } catch (e) { }
}

let pid = function() {
  return ichabod_pid;
}

module.exports = {
  launch,
  interrupt,
  pid
};