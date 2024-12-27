#!/usr/bin/env sh
':' //; exec "$(command -v node || command -v nodejs)" "$0" "$@"

'use strict';

// Shutdown children cleanly on exit
process.on('exit', exitGracefully); 
process.on('SIGTERM', exitGracefully); 
process.on('SIGINT', exitGracefully);
process.on('uncaughtException', (err) => {
  try {
    npid.remove(config.DaemonPidFilePath);
  } catch (err) {
    console.warn(err.message);
  }
  console.error(err);
  if (logger) {
    logger.error(err.message);
    logger.debug(err.stack);
  }
  showUserCrashReport(err);
  process.exit(0);
});
process.on('unhandledRejection', (err) => {
  try {
    npid.remove(config.DaemonPidFilePath);
  } catch (err) {
    console.warn(err.message);
  }
  console.error(err);
  if (logger) {
    logger.error(err.message);
    logger.debug(err.stack);
  }
  showUserCrashReport(err);
  process.exit(0);
});

const { spawn, execSync } = require('node:child_process');
const { homedir } = require('node:os');
const assert = require('node:assert');
const async = require('async');
const program = require('commander');
const dusk = require('../index');
const bunyan = require('bunyan');
const RotatingLogStream = require('bunyan-rotating-file-stream');
const fs = require('node:fs');
const path = require('node:path');
const options = require('./config');
const npid = require('npid');
const levelup = require('levelup');
const leveldown = require('leveldown');
const boscar = require('boscar');
const rc = require('rc');
const encoding = require('encoding-down');
const secp256k1 = require('secp256k1');
const readline = require('node:readline');
const bip39 = require('bip39');
const inquirer = require('inquirer');
const { splitSync } = require('node-split');
const shoes = require('./shoes.js');
const mkdirp = require('mkdirp');
const { tmpdir } = require('os');
const http = require('node:http');
const hsv3 = require('@tacticalchihuahua/granax/hsv3');
const Fuse = require('fuse-native');
const Dialog = require('../lib/zenity.js');
const { 
  uniqueNamesGenerator, 
  adjectives, 
  colors, 
  animals 
} = require('unique-names-generator');
const fuse = require('./fuse.js');

program.version(dusk.version.software);

const description = `
  🝰 dusk ${dusk.version.software}

  anti-©opyright, 2024 tactical chihuahua 
  licensed under the agpl 3

`;

program.description(description);

program.option('--config, -C <file>', 
  'path to a dusk configuration file',
  path.join(homedir(), '.config/dusk/dusk.ini'));

program.option('--datadir <path>', 
  'path to the default data directory',
  path.join(homedir(), '.config/dusk'));

program.option('--setup', 
  'runs initial configuration only then exits (does not connect to network)');

program.option('--kill', 
  'sends the shutdown signal to the daemon');

program.option('--testnet', 
  'runs with reduced identity difficulty');

program.option('--daemon, -D', 
  'sends the dusk daemon to the background');

program.option('--quiet, -Q', 
  'silence terminal output that is not necessary');

program.option('--gui',
  'prompt with graphical dialogs instead of command line prompts');

program.option('--tray', 
  'show system try icon and menu applet');

program.option('--install',
  'writes linux .desktop entry to $HOME/.local/share/applications');

program.option('--fuse [mountpath]',
  'mount the virtual filesystem to the supplied path');

program.option('--rpc [method] [params]', 
  'send a command to the daemon');

program.option('--repl', 
  'starts the interactive rpc console');

program.option('--control-port <port>', 
  'use with --repl / --rpc to set the control port to connect to');

program.option('--control-sock <path>', 
  'use with --repl / --rpc to set the control socket to connect to');

program.option('--logs, -F [num_lines]', 
  'tails the log file defined in the config');

program.option('--show-links', 
  'shows a list of saved startup seeds / linked devices')

program.option('--link [dref]', 
  'adds a startup seed / device link');

program.option('--unlink [id_or_shortname]',
  'removes the given startup seed');

program.option('--export-link', 
  'shows our shareable device link');

program.option('--export-secret', 
  'dumps the private identity key');

program.option('--export-recovery', 
  'dumps the bip39 recovery words');

program.option('--shred [message]', 
  'splits and pads message into uniform shards');

program.option('--retrace [bundle]', 
  're-assembles a dusk bundle created by --shred');

program.option('--ephemeral', 
  'use with --shred --encrypt to generate a one-time use identity key');

program.option('--encrypt [message]', 
  'encrypt a message for yourself');

program.option('--pubkey [hex_pubkey]', 
  'use with --encrypt to set target or alone to print your key');

program.option('--decrypt [message]', 
  'decrypts the message for yourself');

program.option('--file-in [path]', 
  'specify file path to read or be prompted');

program.option('--file-out [path]', 
  'specify file path to write or be prompted');

program.option('--with-secret [hex_secret]',
  'override the configured private key, use with --decrypt and --retrace');

program.option('--shoes', 
  'setup a dusk/SHOES USB or use with --retrace, --shred');

program.option('--usb', 
  'alias for --shoes');

program.option('--dht', 
  'use with --shred, --retrace to store/retrieve shards to/from network');

program.option('--test-hooks',
  'starts onion service that prints received hooks from subscribe() handlers');

program.parse(process.argv);

program.usb = program.usb || program.shoes;

let argv;
let privkey, identity, logger, controller, node, nonce, proof;
let config;
let tray;

let _didSetup = false;

if (program.install) {
  const binpath = execSync('which node').toString().trim();
  const desktop = `[Desktop Entry]
Name=dusk
Comment=darknet under s/kademlia
Terminal=false
Exec=${binpath} ${path.join(__dirname)}/dusk.js --gui --tray %U
Icon=${path.join(__dirname, '../assets/images/favicon.png')}
Categories=Utility;
Type=Application
  `;

  const writeOut = path.join(homedir(), '.local/share/applications/dusk.desktop');
  console.log(`  Installing desktop entry to ${writeOut}...`);
  fs.writeFileSync(writeOut, desktop);
  console.log('');
  console.log('  [ done! ♥ ]');
  process.exit(0);
}

function _config() {
  if (program.datadir) {
    argv = { config: path.join(program.datadir, 'config') };
    program.config = argv.config;
  }

  config = rc('dusk', options(program.datadir), argv);
}

function _setup() {
  return new Promise(async (resolve, reject) => {
    if (!program.Q) {
      console.log(description);
    }

    if (program.usb) {
      program.datadir = await shoes.mount(program, config, exitGracefully);
    }

    if (program.testnet) {
      process.env.dusk_TestNetworkEnabled = '1';
    }

    _config();

    // Initialize logging
    const prettyPrint = spawn(
      path.join(__dirname, '../node_modules/bunyan/bin/bunyan'),
      ['--color']
    );

    logger = bunyan.createLogger({
      name: 'dusk',
      streams: [
        {
          stream: new RotatingLogStream({
            path: config.LogFilePath,
            totalFiles: parseInt(config.LogFileMaxBackCopies),
            rotateExisting: true,
            gzip: false
          })
        },
        { stream: prettyPrint.stdin }
      ],
      level: parseInt(config.VerboseLoggingEnabled) ? 'debug' : 'info'
    });

    if (!program.Q) {
      prettyPrint.stdout.pipe(process.stdout);
    }

    _didSetup = true;
    resolve();
  });
}

async function _init() {
  // import es modules
  const fileSelector = (await import('inquirer-file-selector')).default;
  // import es modules
  
  if (!_didSetup) {
    await _setup();
  }

  if (parseInt(config.TestNetworkEnabled)) {
    logger.info('dusk is running in test mode, difficulties are reduced');
    process.env.dusk_TestNetworkEnabled = config.TestNetworkEnabled;
    dusk.constants.IDENTITY_DIFFICULTY = dusk.constants.TESTNET_DIFFICULTY;
  }

  // Generate a private extended key if it does not exist
  if (!program.withSecret && !program.ephemeral && !fs.existsSync(config.PrivateKeyPath)) {
    const questions = [
      {
        type: 'password',
        name: 'password1',
        message: 'I made you a key, enter a password to protect it? ~>',
      },
      {
        type: 'password',
        name: 'password2',
        message: 'Once more, to make sure? ♥ ~>'
      }
    ];

    let answers;
    
    if (!program.gui) {
      answers = await inquirer.default.prompt(questions);
    } else {
      let d = new Dialog('I made you a key, enter a password to protect it?', {
        text: `Your dusk key is stored encrypted on your device
and is used to protect your files. Anyone with 
your password and access to this device will be 
able to view your data.`
      });
      d.password('password1', 'Set the password');
      d.password('password2', 'Repeat password');
      answers = d.show();

      if (!answers) {
        Dialog.info('You cancelled the setup. I will try again the next time you run dusk.', 'Error', 'error');
        process.exit(1);
      }
    } 

    if (answers.password1 !== answers.password2) {
      if (program.gui) {
        Dialog.info('Passwords did not match, try again?', 'Error', 'error');
        return _init();
      }
      logger.error('Passwords do not match, try again?');
      return _init();
    }

    if (answers.password1.trim() === '') {
      let ignore;
      const message = `You entered a blank password. Are you sure?`;

      if (program.gui) {
        ignore = {
          useBlankPassword: Dialog.info(message, 'Confirm', 'question').status !== 1
        };
      } else {
        ignore = await inquirer.default.prompt({
          name: 'useBlankPassword',
          type: 'confirm',
          message
        });
      }

      if (!ignore.useBlankPassword) {
        return _init(); 
      }
    }

    const sk = dusk.utils.generatePrivateKey();
    const salt = fs.existsSync(config.PrivateKeySaltPath)
      ? fs.readFileSync(config.PrivateKeySaltPath)
      : crypto.getRandomValues(Buffer.alloc(16));
    const encryptedPrivKey = dusk.utils.passwordProtect(answers.password1, salt, sk);
    
    let words = bip39.entropyToMnemonic(sk.toString('hex'));
    let wordlist = words.split(' ').map((word, i) => `${i+1}.  ${word}`);
    words = wordlist.join('\n');

    const text = `Your key is protected, don\'t forget your password! Write these words down, keep them safe. You can also write down all but a few you can remember, I'll trust your judgement.
  
If you lose these words, you can never recover access to this identity, including any data encrypted for your secret key`;

    let savedWords = false;
    
    if (program.gui) {
      Dialog.info(text, 'IMPORTANT', 'warning');
      savedWords = { 
        iPromise: await Dialog.textInfo(words, 'Recovery Words', { 
          checkbox: 'I have written down my recovery words.' 
        }) === 0 
      };
    } else {
      console.warn(text);
      console.log(words);
      savedWords = await inquirer.default.prompt({
        name: 'iPromise',
        type: 'confirm',
        message: 'I have written down my recovery words.'
      });
    }

    if (savedWords.iPromise) {
      fs.writeFileSync(config.PrivateKeySaltPath, salt);
      fs.writeFileSync(config.PrivateKeyPath, encryptedPrivKey);
      fs.writeFileSync(config.PublicKeyPath, secp256k1.publicKeyCreate(sk));
    } else {
      const msg = 'I did not save your key and will exit. Try again.';
      if (program.gui) {
        Dialog.info(msg, 'Error', 'error');
        process.exit(1);
      } else {
        console.error(msg);
        process.exit(1);
      }
    }
    return _init();
  }

  if (fs.existsSync(config.IdentityProofPath)) {
    proof = fs.readFileSync(config.IdentityProofPath);
  }

  if (fs.existsSync(config.IdentityNoncePath)) {
    nonce = parseInt(fs.readFileSync(config.IdentityNoncePath).toString());
  }

  if (program.kill) {
    try {
      const pid = fs.readFileSync(config.DaemonPidFilePath).toString().trim()
      console.log(`  [ shutting down dusk process with id: ${pid} ]`);
      process.kill(parseInt(pid), 'SIGTERM');
      console.log(`  [ done ♥ ]`);
    } catch (err) {
      console.error('I couldn\'t shutdown the daemon, is it running?');
      process.exit(1);
    }
    process.exit(0);
  }

  if (program.exportLink) {  
    let pubbundle

    try {
      pubbundle = fs.readFileSync(config.DrefLinkPath).toString();
    } catch (e) {
      console.error('I couldn\'t find a dref link file, have you run dusk yet?');
      process.exit(1);
    }

    if (program.gui) {
      Dialog.entry('Shareable device link:', '🝰 dusk', pubbundle);
    } else if (program.Q) {
      console.log(pubbundle);
    } else {
      console.log('public dusk link ♥ ~ [  %s  ] ', pubbundle);
    }
    process.exit(0);
  }

  if (program.shred) { 
    console.log('');
    
    let publicKey = program.pubkey || 
      fs.readFileSync(config.PublicKeyPath).toString('hex');

    let entry;

    if (typeof program.shred === 'string') {
      entry = Buffer.from(program.shred, 'hex');
    } else if (typeof program.fileIn === 'string') {
      entry = fs.readFileSync(program.fileIn);
    } else if (program.gui) { 
      program.fileIn = Dialog.file('file', false, false);
      entry = fs.readFileSync(program.fileIn);
    } else {
      program.fileIn = await fileSelector({
        message: 'Select input file:'
      });
      entry = fs.readFileSync(program.fileIn);
    }

    console.log('  encrypting input...');
    const encryptedFile = dusk.utils.encrypt(publicKey, entry);
    console.log('  shredding input and normalizing shard sizes...');
    console.log('  creating parity shards...');
    console.log('');
    const dagEntry = await dusk.DAGEntry.fromBuffer(encryptedFile, entry.length);

    if (!program.Q) {
      for (let i = 0; i < dagEntry.merkle.levels(); i++) {
        console.log(`merkle level${i} ~ [`);;
        const level = dagEntry.merkle.level(i).forEach(l => {
          console.log(`merkle level${i} ~ [  ${l.toString('hex')}  ] `);;
        });
        console.log(`merkle level${i} ~ [`);
      }
    }

    if (!program.fileOut || typeof program.fileOut !== 'string') {
      if (program.fileIn) {
        program.fileOut = `${program.fileIn}.duskbundle`;
      } else {
        console.warn('you didn\'t specify a --file-out so i wont\'t write anything');
      }
    }  
    
    if (program.fileOut) {
      if (program.usb) {
        program.fileOut = path.join(
          program.datadir,
          'shoes.meta',
          `${Date.now()}-${path.basename(program.fileOut)}`
        );
      } else {
        program.fileOut = path.join(
          program.datadir,
          'dusk.meta',
          `${Date.now()}-${path.basename(program.fileOut)}`
        );
      }
      mkdirp.sync(program.fileOut);
    }

    if (fs.existsSync(program.fileOut) && fs.readdirSync(program.fileOut).length) {
      if (program.gui) {
        Dialog.info(`The file ${program.fileOut} already exists. I won't overwrite it`,
          'Sorry', 'error');
      }
      console.error('file %s already exists, i won\'t overwrite it', program.fileOut);
      process.exit(1);
    }

    const meta = dagEntry.toMetadata(`${Date.now()}-${program.fileIn}` || '');
    const metaEnc = dusk.utils.encrypt(publicKey, meta);
    const metaHash160 = dusk.utils.hash160(metaEnc).toString('hex');

    if (program.fileOut) {
      fs.writeFileSync(path.join(program.fileOut, 
        `${metaHash160}.meta`), 
        metaEnc
      );
    }

    let progressBar;
     
    if (program.usb) { 
      console.log('');
      await shoes.shred(dagEntry, program, config, exitGracefully);
    } else if (program.dht) {
      console.log('');
      console.log('  ok, I\'m going to try to connect to dusk\'s control socket...');
      const rpc = await getRpcControl();
      console.log('');
      console.log('  [ we\'re connected ♥ ]')
      console.log('');
      console.log(`  I will attempt to store ${dagEntry.shards.length} shards in the DHT.`);
      console.log('  This can take a while depending on network conditions and the');
      console.log('  overall size of the file.');
      console.log('');
      console.log('  Make sure you are safe to sit here for a moment and babysit me.');
      console.log('  We will do 512Kib at a time, until we are done.');
      console.log('');
            
      let ready = false;

      if (program.gui) {
        ready = Dialog.info(
          `I connected to dusk's control port ♥ 

I will attempt to store ${metaData.l.length} shards in the DHT. This can take a while depending on network conditions and the overall size of the file.

Make sure you are safe to sit here for a moment and babysit me. We will do 512Kib at a time, until we are done.

Ready?
          `,
          '🝰 dusk',
          'question'
        );
      }

      while (!ready) {
        let answers = await inquirer.default.prompt({
          type: 'confirm',
          name: 'ready',
          message: 'Ready?'
        });
        ready = answers.ready;
      }

      console.log('');
      function store(hexValue) {
        return new Promise((resolve, reject) => {
          rpc.invoke('storevalue', [hexValue], (err) => {
            if (err) {
              return reject(err);
            }
            resolve(true);
          });
        });
      }

      if (program.gui) {
        progressBar = Dialog.progress('Shredding file ♥ ...', '🝰 dusk', {
          pulsate: true
        });
      }

      for (let i = 0; i < dagEntry.shards.length; i++) {
        let success;
        if (progressBar) {
          progressBar.progress((i / dagEntry.shards.length) * 100);
          progressBar.text('Storing piece ' + dagEntry.merkle._leaves[i].toString('hex') + '...');
        }
        console.log('  storevalue [  %s  ]', dagEntry.merkle._leaves[i].toString('hex'));
        while (!success) {
          try {
            success = await store(dagEntry.shards[i].toString('hex'));
            console.log('  [  done!  ]');
          } catch (e) {
            console.error(e.message);
            console.log('');
            if (program.gui) {
              tryAgain = { yes: Dialog.info(
                `I wasn't able to store the shard. Would you like to try again? If not, I will exit.`, 
                  '🝰 dusk', 'question') };
            } else {
              tryAgain = await inquirer.default.prompt({
                type: 'confirm',
                name: 'yes',
                message: 'Would you like to try again? If not I will exit.'
              });
            }
            if (!tryAgain.yes) {
              process.exit(1);
            }
          }
        }
      }
      
      if (program.gui) {
        Dialog.notify('File was stored in the dusk network', 'Success!');
      }

      console.log('  [  we did it ♥  ]');
      console.log('');
    } else { 
      for (let s = 0; s < dagEntry.shards.length; s++) {
        if (program.gui) {
          progressBar = Dialog.progress('Shredding file ♥ ...', '🝰 dusk', {
            pulsate: true
          });
        }  
        if (progressBar) {
          progressBar.progress((s / dagEntry.shards.length) * 100);
        }
        if (program.fileOut) {
          fs.writeFileSync(path.join(
            program.fileOut, 
            `${dagEntry.merkle._leaves[s].toString('hex')}.part`
          ), dagEntry.shards[s]);
        }
      }
    }

    if (!program.Q) {
      if (progressBar) {
        progressBar.progress(100);
      }
      if (program.fileOut) {
        console.log('');
        if (program.usb) {
          if (program.gui) {
            Dialog.info('Sneakernet created! Be safe. ♥', '🝰 dusk / SHOES', 'info');
          }
          console.log('sneakernet created ~ be safe  ♥ ');
        } else {
          if (program.gui) {
            Dialog.info('Parts uploaded and metadata written to ' + program.fileOut, '🝰 dusk', 'info'); 
          }
          console.log('bundle written ♥ ~ [  %s  ] ', program.fileOut);
        }
        console.log('meta hash ♥ ~ [  %s  ] ', metaHash160);
        console.log('');
      } else {
        console.log('');
        console.warn('when you\'re ready, try again with --file-in / --file-out');
        console.log('');
      }
    }
    process.exit(0);
  }  

  // Initialize private key
  privkey = await (new Promise(async (resolve, reject) => {
    if (program.withSecret === true) {
      const questions = [{
        type: 'password',
        name: 'secret',
        message: 'Enter the secret key to use? ~>',
      }];
      const answers = program.gui
        ? { secret: Dialog.entry('Enter the secret key to use:', '🝰 dusk') }
        : await inquirer.default.prompt(questions);

      program.withSecret = answers.secret;
    }

    if (typeof program.withSecret === 'string' && dusk.utils.isHexaString(program.withSecret)) {
      return resolve(Buffer.from(program.withSecret, 'hex'));
    }

    if (program.ephemeral) {
      console.log('  You passed --ephemeral, your private key will not be saved');
      program.datadir = path.join(tmpdir(), 'dusk-' + Date.now());
      return resolve(dusk.utils.generatePrivateKey());
    }

    const encryptedPrivKey = fs.readFileSync(config.PrivateKeyPath);
    const questions = [{
      type: 'password',
      name: 'password',
      message: 'Enter password to unlock your key? ~>',
    }];
    const answers = program.gui
      ? { password: Dialog.password('Enter password', '🝰 dusk') }
      : await inquirer.default.prompt(questions);

    if (answers.password === null) {
      process.exit(1);
    }

    const salt = fs.readFileSync(config.PrivateKeySaltPath);
    const sk = dusk.utils.passwordUnlock(answers.password, salt, encryptedPrivKey);
    resolve(sk);
  }));
  identity = new dusk.eclipse.EclipseIdentity(
    Buffer.from(secp256k1.publicKeyCreate(privkey)),
    nonce,
    proof
  );

  // are we starting the daemon?
  if (program.D) {
    console.log('');
    console.log('  [ starting dusk in the background ♥  ]');
    require('daemon')({ cwd: process.cwd() });
  
    try {
      logger.info(`writing pid file to ${config.DaemonPidFilePath}`);
      npid.create(config.DaemonPidFilePath).removeOnExit();
    } catch (err) {
      console.error('Failed to create PID file, is dusk already running?');
      process.exit(1);
    }
  } 

  if (program.retrace) {
    if (typeof program.retrace !== 'string') {
      program.retrace = '';

      while (path.extname(program.retrace) !== '.duskbundle') {
        if (program.retrace) {
          console.error(`${program.retrace} is not a valid .duskbundle, try again...`)
        }
        
        let basePath;

        if (program.usb) {
          basePath = path.join(program.datadir, 'shoes.meta');
        } else {
          basePath = path.join(program.datadir, 'dusk.meta');
        }
        
        if (program.gui) {
          program.retrace = Dialog.file('directory', false, basePath + '/');
        } else {
          program.retrace = await fileSelector({
            type:'directory',
            basePath,
            message: 'Select .duskbundle:',
            filter: (stat) => {
              return path.extname(stat.name) === '.duskbundle' || stat.isDirectory();
            }
          });
        }
      }
    }
      
    console.log(`  Validating .duskbundle ...`);

    if (path.extname(program.retrace) !== '.duskbundle') {

      if (program.gui) {
        Dialog.info('Not a valid .duskbundle. Try again?', 'Sorry', 'error');
      }

      console.error('  The path specified does not have a .duskbundle extension.');
      console.error('  Did you choose the right folder?');
      console.error('  If you renamed the folder, make sure it ends in .duskbundle');
      process.exit(1);
    }
    
    const bundleContents = fs.readdirSync(program.retrace); 
    const metaFiles = bundleContents.filter(f => path.extname(f) === '.meta');

    if (metaFiles.length > 1) {

      if (program.gui) {
        Dialog.info('Not a valid .duskbundle. Try again?', 'Sorry', 'error');
      }

      console.error('i found more than one meta file and don\'t know what to do');
      process.exit(1);
    } else if (metaFiles.length === 0) {

      if (program.gui) {
        Dialog.info('Not a valid .duskbundle. Try again?', 'Sorry', 'error');
      }
     
      console.error('missing a meta file, i don\'t know how to retrace this bundle');
      process.exit(1);
    }
    const metaPath = path.join(program.retrace, metaFiles.pop());
    const metaData = JSON.parse(dusk.utils.decrypt(
      privkey.toString('hex'),
      fs.readFileSync(metaPath)
    ).toString('utf8'));
    
    let missingPieces = 0;
    let progressBar;

    console.log('  read meta file successfully ♥ ');
    console.log('');
    console.log('  retracing from merkle leaves... ');

    let shards;
    
    if (program.usb) {
      shards = (await shoes.retrace(metaData, program, config, exitGracefully)).map(part => {
        if (!part) {
          console.warn('missing part detected');
          missingPieces++;
        
          if (missingPieces > metaData.p) {
            if (program.gui) {
              Dialog.info('Too many missing pieces to recover this file', 
                'Sorry', 'error');
            }
            console.error('too many missing shards to recover this file');
            process.exit(1);
          }  
        
          return Buffer.alloc(dusk.DAGEntry.INPUT_SIZE);
        }
        return part;
      });
    } else if (program.dht) {
      if (program.gui) {
        progressBar = Dialog.progress('Retracing file ♥ ...', '🝰 dusk', {
          pulsate: true
        });
      }
        
      shards = [];

      console.log('');
      console.log('  ok, I\'m going to try to connect to dusk\'s control socket...');
      const rpc = await getRpcControl();
      console.log('');
      console.log('  [ we\'re connected ♥ ]')
      console.log('');
      console.log(`  I will attempt to find ${metaData.l.length} shards in the DHT.`);
      console.log('  This can take a while depending on network conditions and the');
      console.log('  overall size of the file.');
      console.log('');
      console.log('  Make sure you are safe to sit here for a moment and babysit me.');
      console.log('  We will do 512Kib at a time, until we are done.');
      console.log(''); 
      
      let ready = false;

      if (program.gui) {
        ready = Dialog.info(
          `I connected to dusk's control port ♥ 

I will attempt to find ${metaData.l.length} shards in the DHT. This can take a while depending on network conditions and the overall size of the file.

Make sure you are safe to sit here for a moment and babysit me. We will do 512Kib at a time, until we are done.

Ready?
          `,
          '🝰 dusk',
          'question'
        ).status === 0;

        if (!ready) {
          Dialog.info('Ok, cancelled.', '🝰 dusk', 'info');
          exitGracefully();
        }
      }

      while (!ready) {
        let answers = await inquirer.default.prompt({
          type: 'confirm',
          name: 'ready',
          message: 'Ready?'
        });
        ready = answers.ready;
      }

      console.log('');
      
      function findvalue(hexKey) {
        return new Promise((resolve, reject) => {
          rpc.invoke('findvalue', [hexKey], (err, data) => {
            if (err) {
              return reject(err);
            }
            if (data.length && data.length > 1) {
              return reject(new Error('Could not find shard.'));
            }
            resolve(Buffer.from(data.value, 'hex'));
          });
        });
      }

      for (let i = 0; i < metaData.l.length; i++) {
        let success;
        if (progressBar) {
          progressBar.progress((i / metaData.l.length) * 100);
          progressBar.text(`Finding shard ${metaData.l[i].toString('hex')}...`);
        }
        console.log('  findvalue [  %s  ]', metaData.l[i].toString('hex'));
        while (!success) {
          try {
            let shard = await findvalue(metaData.l[i].toString('hex'));
            console.log('  [  done!  ]');
            shards.push(shard);
            success = true;
          } catch (e) {
            console.error(e.message);
            console.log('');
            let tryAgain;

            if (program.gui) {
              tryAgain = { yes: Dialog.info(
                `I wasn't able to find the shard. Would you like to try again? If not, I will skip it.`, 
                  '🝰 dusk', 'question') };
            } else {
              tryAgain = await inquirer.default.prompt({
                type: 'confirm',
                name: 'yes',
                message: 'Would you like to try again? If not I will skip it.'
              });
            }

            if (!tryAgain.yes) {
              missingPieces++;
              
              if (missingPieces > metaData.p) {
                if (program.gui) {
                  Dialog.info('Too many missing pieces to recover this file right now.', 
                    'Sorry', 'error');
                }

                console.error('too many missing shards to recover this file');
                process.exit(1);
              }

              shards.push(Buffer.alloc(dusk.DAGEntry.INPUT_SIZE));
              console.log('  [  skip.  ]');
              success = true;
            }
          }
        }
      } 
      
      console.log('');
      console.log('  [  we did it ♥  ]');
      console.log('');
    } else {
      shards = metaData.l.map(hash => {
        console.log(`  reconstructing  [ ${hash}`);
        if (!fs.existsSync(path.join(program.retrace, `${hash}.part`))) {
          console.warn('missing part detected for hash %s', hash);
          missingPieces++;

          if (missingPieces > metaData.p) {
            if (program.gui) {
              Dialog.info('Too many missing pieces to recover this file right now.', 
                'Sorry', 'error');
            }
            console.error('too many missing shards to recover this file');
            process.exit(1);
          }

          return Buffer.alloc(dusk.DAGEntry.INPUT_SIZE);
        }
        return fs.readFileSync(path.join(program.retrace, `${hash}.part`));
      });
    }

    if (progressBar) {
      progressBar.text(' I reconstructed the encrypted file ♥ ');
    }

    console.log('');
    console.log('  [ I reconstructed the encrypted and erasure coded buffer ♥ ]');
    console.log('');
    
    if (missingPieces) {
      if (progressBar) {
        progressBar.text('There were some missing pieces. I will try to recover them...');
      }
      console.log('  attempting to encode missing parts from erasure codes...')
      shards = splitSync(await dusk.reedsol.encodeCorrupted(splitSync(Buffer.concat(shards), {
        bytes: dusk.DAGEntry.INPUT_SIZE
      })), { bytes: dusk.DAGEntry.INPUT_SIZE });
    } 

    while (metaData.p--) {
      shards.pop();
    }

    if (progressBar) {
      progressBar.progress(100);
    }

    if (program.usb) {
      if (program.gui) {
        Dialog.info('USER 0, I am ready to finish retracing and save to your USB drive.', '🝰 dusk / SHOES', 'info');
      }

      console.log('  USER 0, I\'m ready to finish retracing and save to');
      console.log('  your dusk/SHOES USB.');
      console.log('');
      program.datadir = await shoes.mount(program, config, exitGracefully);
    }

    const mergedNormalized = Buffer.concat(shards).subarray(0, metaData.s.a);
    const [unbundledFilename] = program.retrace.split('.duskbundle');
    const dirname = path.dirname(program.usb ? program.datadir : unbundledFilename);
    const filename = path.join(dirname, `unbundled-${Date.now()}-${path.basename(unbundledFilename)}`);
    const decryptedFile = dusk.utils.decrypt(privkey.toString('hex'), mergedNormalized);
    const fileBuf = Buffer.from(decryptedFile);
    const trimmedFile = fileBuf.subarray(0, metaData.s.o);

    if (fs.existsSync(filename)) {
      if (program.gui) {
        Dialog.info(`${filename} already exists. I won't overwrite it.`, 'Sorry', 'error');
      }

      console.error(`${filename} already exists, I won't overwrite it.`);
      process.exit(1);
    }

    fs.writeFileSync(filename, trimmedFile);

    if (program.gui) {
      Dialog.notify(`Retraced successfully!\nSaved to ${filename}`, '🝰 dusk');
    }

    console.log('');
    console.log(`  [ File retraced successfully ♥ ]`);
    console.log(`  [ I saved it to ${filename} ♥ ]`);
    console.log('');
    process.exit(0);
  }
 
  if (program.exportSecret) {
    if (program.gui) {
      Dialog.entry('Private Key:', '🝰 dusk', privkey.toString('hex'));
    } else if (program.Q) {
      console.log(privkey.toString('hex'));
    } else {
      console.log('secret key ♥ ~ [  %s  ] ', privkey.toString('hex'));
    }
    process.exit(0);
  }

  if (program.exportRecovery) {
    let words = bip39.entropyToMnemonic(privkey.toString('hex'));
    let wordlist = words.split(' ').map((word, i) => `${i+1}.  ${word}`);
    words = wordlist.join('\n');

    if (program.gui) {
      Dialog.textInfo(words, 'Recovery Words');
    } else if (program.Q) {
      console.log(bip39.entropyToMnemonic(privkey.toString('hex')));
    } else {
      console.log('recovery words ♥ ~ [  %s  ] ', bip39.entropyToMnemonic(privkey.toString('hex')));
    }
    process.exit(0);
  }
  let pubkey = Buffer.from(secp256k1.publicKeyCreate(privkey)).toString('hex');

  if (program.encrypt) {
    if (program.ephemeral && program.pubkey) {
      if (program.gui) {
        Dialog.info('I cannot encrypt, because i got contradicting input.', 'Sorry', 'error');
      }
      console.error('i don\'t know how to encrypt this because --ephemeral and --pubkey contradict');
      console.error('choose one or the other');
      process.exit(1);
    }

    if (program.ephemeral) {
      const sk = dusk.utils.generatePrivateKey();
      let words = bip39.entropyToMnemonic(sk.toString('hex'));
      let wordlist = words.split(' ').map((word, i) => `${i+1}.  ${word}`);
      words = wordlist.join('\n');
      program.pubkey = Buffer.from(secp256k1.publicKeyCreate(sk));

      const text = `
  I generated a new key, but I didn't store it.
  I'll encrypt using it, but you'll need to write these words down:

  [  ${words}  ]

  If you lose these words, you won't be able to recover this file from
  a reconstructed bundle - it will be gone forever.
      `;

      let savedWords = false;
      
      if (program.gui) {
        savedWords = { 
          iPromise: await Dialog.textInfo(words, 'Recovery Words', { 
            checkbox: 'I have written down my recovery words.' 
          }) === 0 
        };
      } else {
        console.log(text);
        savedWords = await inquirer.default.prompt({
          name: 'iPromise',
          type: 'confirm',
          message: 'I have written down my recovery words.'
        });
      }

      if (!savedWords.iPromise) {
        const msg = 'I did will not proceed. Try again.';
        if (program.gui) {
          Dialog.info(msg, 'Error', 'error');
          process.exit(1);
        } else {
          console.error(msg);
          process.exit(1);
        }  
      }

      if (program.gui) {
        Dialog.entry('One-time secret:', '🝰 dusk', sk.toString('hex'));
      } else {
        console.log(`  ephemeral secret [ ${sk.toString('hex')} ]`);
      }
    }

    if (!Buffer.isBuffer(program.pubkey)) {
      if (typeof program.pubkey === 'string') {
        pubkey = program.pubkey;
      } else if (program.pubkey === true) {
        // TODO show list dialog of link/seeds pubkeys
        const questions = [{
          type: 'text',
          name: 'pubkey',
          message: 'Enter public key to use for encryption? ~>',
        }];
        const answers = program.gui
          ? { pubkey: Dialog.entry('Enter public key to use for encryption', '🝰 dusk') }
          : await inquirer.default.prompt(questions);

        if (!answers.pubkey) {
          process.exit(1);
        }
        program.pubkey = answers.pubkey;
      } else {
        pubkey = Buffer.from(secp256k1.publicKeyCreate(privkey)).toString('hex');
      }
    } else {
      pubkey = program.pubkey;
    }

    if (typeof program.fileIn === 'string') {
      program.encrypt = fs.readFileSync(program.fileIn);
    } else if (program.fileIn) {
      if (program.gui) {
        program.encrypt = fs.readFileSync(Dialog.file('file', false, false));
      } else {
        program.encrypt = fs.readFileSync(await fileSelector({ 
          message: 'Select file to encrypt' 
        })); 
      }
    } else if (program.encrypt === true) {
      const questions = [{
        type: 'text',
        name: 'encrypt',
        message: 'Enter a message to encrypt? ~>',
      }];
      const answers = program.gui
        ? { encrypt: Dialog.entry('Enter a message to encrypt:', '🝰 dusk') }
        : await inquirer.default.prompt(questions);

      if (!answers.encrypt) {
        process.exit(1);
      }
      program.encrypt = Buffer.from(answers.encrypt, 'utf8');
    } else if (!dusk.utils.isHexaString(program.encrypt)) {
      const msg = 'String arguments to --encrypt [message] must be hexidecimal';
      if (program.gui) {
        Dialog.info(msg, 'Error', 'error');
      } else {
        console.error(msg);
      }
      process.exit(1);
    }

    let ciphertext = dusk.utils.encrypt(pubkey, program.encrypt);
    
    if (program.fileOut) {
      if (fs.existsSync(program.fileOut)) {
        const msg = 'File already exists, I will not overwrite it.';
        if (program.gui) {
          Dialog.info(msg, 'Error', 'error');
        } else {
          console.error(msg);
        }
        process.exit(1);
      }

      fs.writeFileSync(program.fileOut, ciphertext);
      console.log('encrypted ♥ ~ [  file: %s  ] ', program.fileOut);
    } else if (program.gui) {
      Dialog.entry('Encrypted Message:', '🝰 dusk', ciphertext.toString('hex'));
    } else if (!program.Q) {
      console.log('encrypted ♥ ~ [  %s  ] ', ciphertext.toString('hex'));
    } else {
      console.log(ciphertext);
    }

    process.exit(0);
  }

  if (program.pubkey) {
    if (program.gui) {
      Dialog.entry('Public Key:', '🝰 dusk', pubkey);
    } else if (!program.Q) {
      console.log('public key ♥ ~ [  %s  ] ', pubkey);
    } else {
      console.log(pubkey);
    }
    process.exit(0);
  }

  if (program.decrypt) {
    let cleartext;
    if (program.decrypt === true && !program.fileIn) {
      const questions = [{
        type: 'text',
        name: 'decrypt',
        message: 'Enter a message to decrypt? ~>',
      }];
      const answers = program.gui
        ? { decrypt: Dialog.entry('Enter a message to decrypt:', '🝰 dusk') }
        : await inquirer.default.prompt(questions);

      if (!answers.decrypt) {
        process.exit(1);
      }

      program.decrypt = answers.decrypt;
    }

    if (typeof program.decrypt === 'string') {
      if (program.fileIn) {
        console.error('i don\'t know what to decrypt because you passed a string to ');
        console.error('--decrypt but also specified --file-in');
        process.exit(1);
      }
      cleartext = dusk.utils.decrypt(privkey.toString('hex'), Buffer.from(program.decrypt, 'hex'));
    } else {
      const filepath = typeof program.fileIn === 'string' 
        ? program.fileIn 
        : program.gui 
          ? Dialog.file('file', false, false)
          : await fileSelector({ message: 'Select file to decrypt' }); 

      try {
        cleartext = dusk.utils.decrypt(privkey.toString('hex'), 
          fs.readFileSync(filepath));
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    }

    if (program.gui) {
      Dialog.textInfo(cleartext, '🝰 dusk');
    } else if (!program.Q) {
      console.log('decrypted ♥ ~ [  %s  ] ', cleartext);
    } else {
      console.log(cleartext);
    }
    process.exit(0);
  }
 
  // If identity is not solved yet, start trying to solve it
  let identityHasValidProof = false;

  console.log(`  proof difficulty param [ N=${dusk.constants.IDENTITY_DIFFICULTY.n} ]`);
  console.log(`  proof difficulty param [ K=${dusk.constants.IDENTITY_DIFFICULTY.k} ]`);

  try {
    identityHasValidProof = await identity.validate();
  } catch (err) {
    console.warn(`Identity validation failed, ${err.message}`);
  }

  if (!identityHasValidProof) {
    console.log(`  identity proof not yet solved, this will take a moment...`);

    let progress;
    if (program.gui) {
      progress = Dialog.progress(
        'Generating a strong identity key. This can take a while, but only runs once.', 
        '🝰 dusk', 
        { pulsate: true, noCancel: true }
      );
    } 
    await identity.solve();
    if (progress) {
      progress.progress(100);
    }
    fs.writeFileSync(config.IdentityNoncePath, identity.nonce.toString());
    fs.writeFileSync(config.IdentityProofPath, identity.proof);
    console.log('');
    console.log('  [  identity solution found ♥  ]');
  }
  console.log('');
  console.log(`  pubkey [ ${identity.pubkey.toString('hex')} ]`);
  console.log(`  proof [ ${identity.proof.toString('hex')} ]`);
  console.log(`  nonce [ ${identity.nonce} ]`);
  console.log(`  fingerprint [ ${identity.fingerprint.toString('hex')} ]`);
  console.log('');

  if (program.usb) {
    await shoes.init(program, config, privkey, identity);
  }
    
  if (program.setup) {
    if (program.gui) {
      Dialog.info('Setup complete! The device is ready to use. ♥ ', '🝰 dusk', 'info');
    }
    console.log('  Setup complete! The device is ready to use. ♥ ');
    return exitGracefully();
  }

  if (program.usb) {
    const warn = 'Running dusk online with configuration from a USB drive is not readily supported and may not function at all with the defaults.' +
      '\n\nI hope you know what you\'re doing!';

    if (program.gui) {
      Dialog.info(warn, '🝰 dusk', 'warning');
    }

    console.warn(warn);
  }

  initDusk();
}

function showUserCrashReport(err) {
  if (program.gui) {
    Dialog.info(err, '🝰 dusk: fatal', 'error');
  }
  console.log(err);
}

function exitGracefully() {
  try {
    npid.remove(config.DaemonPidFilePath);
  } catch (e) {
    
  }

  process.removeListener('exit', exitGracefully);

  if (program.fuse) {
    Fuse.unmount(program.fuse, console.log);
  }

  if (controller && parseInt(config.ControlSockEnabled)) {
    controller.server.close();
  }

  process.exit(0);
}

function registerControlInterface() {
  assert(!(parseInt(config.ControlPortEnabled) &&
           parseInt(config.ControlSockEnabled)),
  'ControlSock and ControlPort cannot both be enabled');

  controller = new boscar.Server(new dusk.Control(node));

  if (parseInt(config.ControlPortEnabled)) {
    logger.info('binding controller to port ' + config.ControlPort);
    controller.listen(parseInt(config.ControlPort), '0.0.0.0');
  }

  if (parseInt(config.ControlSockEnabled)) {
    logger.info('binding controller to path ' + config.ControlSock);
    controller.listen(config.ControlSock);
  }
}

async function initDusk() {
  console.log('\n  starting dusk ♥ ');
  let progress;

  if (program.gui) {
    progress = Dialog.progress('Connecting, hang tight! ♥', '🝰 dusk', {
      pulsate: true,
      noCancel: true
    });
  }
  // Initialize public contact data
  const contact = {
    hostname: '',
    protocol: 'http:',
    port: parseInt(config.NodePublicPort)
  };

  const transport = new dusk.HTTPTransport();

  // Initialize protocol implementation
  node = new dusk.KademliaNode({
    logger,
    transport,
    contact,
    storage: levelup(encoding(leveldown(config.EmbeddedDatabaseDirectory)))
  });
  
  // Extend S/Kademlia with Quasar pub/sub
  node.plugin(dusk.quasar());
  // Sign and verify messages
  node.spartacus = node.plugin(dusk.spartacus(privkey, {
    checkPublicKeyHash: false
  }));
  // DHT is content addressable only - no arbitrary k/v pairs
  node.content = node.plugin(dusk.contentaddress({
    valueEncoding: 'hex'
  }));
  // Mitigage exclipse attacks by requiring equihash proofs
  node.eclipse = node.plugin(dusk.eclipse(identity));

  // Route all traffic through Tor and establish an onion service
  dusk.constants.T_RESPONSETIMEOUT = 20000;
  node.onion = node.plugin(dusk.onion({
    dataDirectory: config.OnionHiddenServiceDirectory,
    virtualPort: config.OnionVirtualPort,
    localMapping: `127.0.0.1:${config.NodeListenPort}`,
    torrcEntries: {
      // dusk-specific Tor configuration
      CircuitBuildTimeout: 10,
      KeepalivePeriod: 60,
      NewCircuitPeriod: 60,
      NumEntryGuards: 8,
      Log: `${config.OnionLoggingVerbosity} stdout`
    },
    passthroughLoggingEnabled: !program.Q && !!parseInt(config.OnionLoggingEnabled)
  }));

  // Handle any fatal errors
  node.on('error', (err) => {
    logger.error(err.message.toLowerCase());
  });

  // Use verbose logging if enabled
  if (!!parseInt(config.VerboseLoggingEnabled)) {
    node.plugin(dusk.logger(logger));
  }

  // Cast network nodes to an array
  if (typeof config.NetworkBootstrapNodes === 'string') {
    config.NetworkBootstrapNodes = config.NetworkBootstrapNodes.trim().split();
  }

  if (program.fuse) {
    program.fuse === true 
      ? path.join(tmpdir(), 'dusk.vfs')
      : program.fuse;
    logger.info('mounting fuse virtual filesystem');
    await fuse(program.fuse, program.datadir);
    logger.info(`mounted to path ${mnt}`);
    if (program.gui) {
      Dialog.notify('Virtual filesystem mounted.\n' + mnt);
    }
  }

  async function joinNetwork(callback) {
    let peers = config.NetworkBootstrapNodes;
    const seedsdir = path.join(program.datadir, 'seeds');

    if (!fs.existsSync(seedsdir)) {
      mkdirp.sync(seedsdir);
    }
    peers = peers.concat(fs.readdirSync(seedsdir).map(fs.readFileSync).map(buf => {
      return buf.toString();
    })).filter(p => !!p);

    if (peers.length === 0) {
      if (progress) {
        progress.progress(100);
      }

      if (program.gui) {
        Dialog.notify(`You are online, but have not added any peer links. 
Swap links with friends or team members and add them using the menu.

I will still listen for incoming connections. ♥`, '🝰 dusk', 'info');
      }

      if (program.tray && tray) {
        tray.tray.onReady(() => {
          tray.tray.sendAction(tray.NET_STATUS_LISTENING);
        });
      }

      logger.info('no bootstrap seeds provided');
      logger.info('running in seed mode (waiting for connections)');

      return node.router.events.once('add', (identity) => {
        config.NetworkBootstrapNodes = [
          dusk.utils.getContactURL([
            identity,
            node.router.getContactByNodeId(identity)
          ])
        ];
        logger.info(config.NetworkBootstrapNodes)
        joinNetwork(callback)
      });
    }

    logger.info(`joining network from ${peers.length} seeds`);
    
    if (program.gui) {
      progress.progress(100);
      progress = Dialog.progress(`Joining network via ${peers.length} links...`, '🝰 dusk', {
        pulsate: true,
        noCancel: true
      });
    }

    async.detectSeries(peers, (url, done) => {
      const contact = dusk.utils.parseContactURL(url);
      logger.info('contacting', contact);
      node.join(contact, (err) => {
        done(null, (err ? false : true) && node.router.size > 1);
      });
    }, (err, result) => {
      if (program.gui) {
        progress.progress(100);
      }
      if (!result) {
        logger.error(err);
        logger.error('failed to join network, will retry in 1 minute');
        if (program.gui) {
          Dialog.info('Failed to join network. I will try again every minute until I get through.', '🝰 dusk', 'warn');
        }
        callback(new Error('Failed to join network'));
      } else { 
        callback(null, result);
        if (program.tray && tray) {
          tray.tray.sendAction(tray.NET_STATUS_CONNECTED);
        }
      }
    });
  }

  node.listen(parseInt(config.NodeListenPort), async () => {
    logger.info('dusk node is running! your identity is:');
    logger.info('');
    logger.info('');
    const identBundle = dusk.utils.getContactURL([node.identity, node.contact]); 
    logger.info(identBundle);
    logger.info('');
    logger.info('');
    fs.writeFileSync(
      config.DrefLinkPath,
      identBundle
    );
    
    registerControlInterface();

    if (program.tray) {
      tray = require('./tray.js')(await getRpcControl(), program, config, exitGracefully);
    }

    async.retry({
      times: Infinity,
      interval: 60000
    }, done => joinNetwork(done), (err, entry) => {
      if (err) {
        logger.error(err.message);
        process.exit(1);
      }
      
      if (program.gui) {
        Dialog.notify(`Connected (${node.router.size} peers) ♥`, '🝰 dusk', 
          path.join(__dirname, '../assets/images/favicon.png'));
      }
 
      logger.info(`connected to network via ${entry}`);
      logger.info(`discovered ${node.router.size} peers from seed`);
    });
  });
}

function getRpcControl() {
  return new Promise((resolve, reject) => {
    config = config || rc('dusk', options(program.datadir), argv);
    
    if (program.controlPort) {
      config.ControlPort = program.controlPort;
      config.ControlPortEnabled = '1';
      config.ControlSockEnabled = '0';
    }

    if (program.controlSock) {
      config.ControlSock = program.controlSock;
      config.ControlSockEnabled = '1';
      config.ControlPortEnabled = '0';
    }

    try {
      assert(!(parseInt(config.ControlPortEnabled) &&
               parseInt(config.ControlSockEnabled)),
        'ControlSock and ControlPort cannot both be enabled');
    } catch (e) {
      reject(e);
      console.error(e.message);
      process.exit(1);
    }

    const client = new boscar.Client();

    if (parseInt(config.ControlPortEnabled)) {
      client.connect(parseInt(config.ControlPort));
    } else if (parseInt(config.ControlSockEnabled)) {
      client.connect(config.ControlSock);
    }

    client.on('ready', () => resolve(client));

    client.socket.on('close', () => {
      console.error('Connection terminated! :(');
      process.exit(1);
    });

    client.on('error', err => {
      console.error(err);
      process.exit(1)
    });
  });
}

// Check if we are sending a command to a running daemon's controller
if (program.rpc || program.repl) {
  rpcRepl();

  async function rpcRepl() {
    const client = await getRpcControl();

    if (program.rpc === true || program.repl) {
      if (program.rpc) {
        logger.warn('no command provided to --rpc, starting repl');
      }
      return setTimeout(() => _initRepl(), 100);
    }

    const [method, ...params] = program.rpc.trim().split(' ');
    console.log(`(dusk:rpc) <~ ${method}(${params.join(' , ')})`);
    client.invoke(method, params, function(err, ...results) {
      if (err) {
        console.error(`(dusk:rpc) ~> ${err.message}`);
        process.exit(1);
      } else {
        console.info('(dusk:rpc) ~>');
        console.dir(results, { depth: null });
        process.exit(0);
      }
    });

    function _initRepl() {
      console.log('hi ♥');
      console.log('?? try: help\n');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '(dusk:repl) ~ ',
      });

      rl.prompt();

      rl.on('line', (line) => {
        if (!line) {
          return rl.prompt();
        }

        if (line === 'quit' || line === 'exit') {
          console.log('bye ♥ ');
          process.exit(0);
        }

        const [method, ...params] = line.trim().split(' ');
        client.invoke(method, params, function(err, ...results) {
          if (err) {
            console.error(err.message);
          } else {
            console.dir(results, { depth: null });
          }
        
          rl.prompt();
        });
      }).on('close', () => {
        console.log('bye ♥ ');
        process.exit(0);
      });
    }
  }
} else if (program.F) { // --logs
  _config();

  const numLines = program.F === true 
    ? 500
    : parseInt(program.F);

  if (program.gui) {
    const rawLogs = execSync(`tail -n ${numLines} ${config.LogFilePath}`)
      .toString().split('\n');
    const values = [];
    const parsedLogs = rawLogs.map(l => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return { time: '', level: '', msg: '' };
      }
    });
    parsedLogs.forEach(log => {
      values.push([log.time, log.level, log.msg]);
    });
    return Dialog.list('🝰 dusk', 'Debug Logs', values, [
      'Time', 'Type', 'Message'
    ], {
      width: 1024,
      height: 768,
      multiple: true,
      editable: true
    });
  }

  const tail = spawn('tail', ['-n', numLines, '-f', config.LogFilePath]);
  const pretty = spawn(
    path.join(__dirname, '../node_modules/bunyan/bin/bunyan'),
    ['--color']
  );
  pretty.stdout.pipe(process.stdout);
  tail.stdout.pipe(pretty.stdin);
} else if (program.testHooks) {
  console.log(description);
  console.log('');
  console.log('  I\'m setting up a local web server and onion service...')
  // Start a simple onion service that prints received requests
  // not for production use - ONLY for testing subscribe() hooks
  const dataDirectory = path.join(tmpdir(), 'dusk-hook-test-' + Date.now());
  const server = http.createServer((request, response) => {
    let body = '';
    request
      .on('error', console.error)
      .on('data', data => body += data.toString())
      .on('end', () => {
        try {
          body = JSON.parse(body);
          console.log('  [  hook received  ]', body);
        } catch (e) {
          console.error('Failed to parse content', e.message);
        }
        response.end();
      });
  });
  server.listen(0, () => {
    const localPort = server.address().port;
    const tor = hsv3([
      {
        dataDirectory: path.join(dataDirectory, 'hidden_service'),
        virtualPort: 80,
        localMapping: '127.0.0.1:' + localPort
      }
    ], {
      DataDirectory: dataDirectory
    });

    tor.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });

    tor.on('ready', () => {
      console.log('');
      console.log('  [  dusk hook listener created  ♥  ]');
      console.log('  [  %s  ]',
        fs.readFileSync(path.join(dataDirectory, 'hidden_service',
          'hostname')).toString().trim());
      console.log('');
      console.log('  Hooks will print here when they are received.');
      console.log('');
    });
  });
} else if (program.showLinks) {
  const seedsdir = path.join(program.datadir, 'seeds');
  const values = fs.readdirSync(seedsdir).map(v => {
    const value = v.split('.');
    value.push(fs.readFileSync(path.join(seedsdir, v)).toString());
    return value;
  });

  if (!values.length) {
    values.push(['-', '-', '-']);
  }

  if (program.gui) {
    Dialog.list('🝰 dusk', 'Linked devices:', values, ['Name', 'Fingerprint', 'Link'], {
      width: 800,
      height:500
    });
  } else {
    values.forEach(v => {
      console.log('');
      console.log('Name:', v[1]);
      console.log('Fingerprint:', v[0]);
      console.log('Link:', v[2]);
      console.log('');
    });
  }
} else if (program.link) {
  console.log(description);

  async function _link() {
    if (program.link === true){
      const questions = [{
        type: 'text',
        name: 'link',
        message: 'Enter a device link to add? ~>',
      }];
      const answers = program.gui
        ? { link: Dialog.entry('Enter a device link to add:', '🝰 dusk') }
        : await inquirer.default.prompt(questions);

      if (!answers.link) {
        process.exit(1);
      }

      program.link = answers.link;
    }

    try {
      const [id, contact] = dusk.utils.parseContactURL(program.link);
      const seedsdir = path.join(program.datadir, 'seeds');
      const randomName = uniqueNamesGenerator({ 
        dictionaries: [adjectives, colors, animals] 
      });
      console.log('  saving seed to %s', seedsdir);
      console.log('  i will connect to this node on startup');
      fs.writeFileSync(path.join(seedsdir, `${id}.${randomName}`), program.link);
      
      if (program.gui) {
        Dialog.notify(`I will connect to device "${randomName}" on startup`, 
          'Device linked!');
      }
      console.log('');
      console.log(`  [  done ♥  device codename: ${randomName} ]`)
    } catch (e) {
      if (program.gui) {
        Dialog.info(e.message, 'Sorry', 'error');
      }
      console.error(e.message);
      process.exit(1);
    }
  }
  _link();
} else if (program.unlink) {
  console.log(description);
  
  async function _unlink() {
    const seedsdir = path.join(program.datadir, 'seeds');
    let idOrShortname;

    if (fs.readdirSync(seedsdir).length === 0) {
      if (program.gui) {
        Dialog.info('No devices to unlink.', 'Sorry', 'error');
      } else {
        console.error('No devices to unlink.')
      }
      process.exit(1);
    }

    if (program.unlink === true) {
      let answer;
      const choices = {
        message: 'Select a device to unlink? ~>',
        choices: fs.readdirSync(seedsdir).map(val => {
          const [id, shortname] = val.split('.');
          return {
            name: shortname,
            value: id,
            description: `(${id})`
          }
        })
      };
      if (program.gui) {
        let d = new Dialog('🝰 dusk', {
          text: 'Select the device to unlink...'
        });
        d.combo('unlink', 'Devices', fs.readdirSync(seedsdir).map(v => {
          return v.split('.')[1];
        }));
        answer = d.show();

      } else {
        answer = { unlink: await inquirer.default.prompt.prompts.select(choices) };
      }

      if (!answer || !answer.unlink) {
        process.exit(1);
      }

      idOrShortname = answer.unlink;
    } else {
      idOrShortname = program.unlink;
    }

    try {  
      let match = null;
      let links = fs.readdirSync(seedsdir);

      for (let i = 0; i < links.length; i++) {
        let [id, shortname] = links[i].split('.');
        if (idOrShortname === id || idOrShortname === shortname) {
          match = links[i];
          break;
        }
      }

      if (!match) {
        if (program.gui) {
          Dialog.info('I do not recognize that link', 'Sorry', 'error');
        } else {
          console.error('I do not recognize that link.');
        }
        process.exit(1);
      }

      console.log('  removing %s from %s', program.unlink, seedsdir);
      console.log('');
      console.log('  i will not connect to this node on startup');
      fs.unlinkSync(path.join(seedsdir, match));
      console.log('');
      console.log('  [  done ♥  ]');
      if (program.gui) {
        Dialog.notify('I will not connect the this link on startup anymore', 
          'Device unlinked');
      }
    } catch (e) {
      if (program.gui) {
        Dialog.info(e, 'Fatal', 'error');
      }
      console.error(e.message);
      process.exit(1);
    }
  }

  _unlink();
} else {
  // Otherwise, kick everything off
  _init();
}
