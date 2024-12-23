'use strict';

const Tray = require('systray').default;
const { spawn, fork } = require('node:child_process');
const path = require('node:path');
const Dialog = require('../lib/zenity');
const fs = require('node:fs');

const shoesTitle = '🝰 dusk / SHOES '
const duskTitle = '🝰 dusk'

function _dusk(args) {
  return fork(path.join(__dirname, 'dusk.js'), args);
}

function _init(rpc, program, config, exitGracefully) {
  const NET_STATUS_CONNECTING = { 
    type: 'update-item', 
    seq_id: 0, 
    item: { 
      checked: false, 
      enabled: false, 
      title: '🔄  Connecting...' 
    }
  };
  const NET_STATUS_CONNECTED = { 
    type: 'update-item', 
    seq_id: 0, 
    item: {
      checked: false, 
      enabled: false, 
      title: ' 🔐  Connected' 
    }
  };
  const NET_STATUS_LISTENING = { 
    type: 'update-item', 
    seq_id: 0, 
    item: {
      checked: false, 
      enabled: false, 
      title: '⌚  Waiting for a link...' 
    }
  };

  const FUSE_STATUS_NOT_MOUNTED = {
    type: 'update-item',
    seq_id: 2,
    item: {
      title: '🗂  Mount virtual folders',
      enabled: true,
      checked: false
    }
  };
  const FUSE_STATUS_MOUNTED = {
    type: 'update-item',
    seq_id: 2,
    item: {
      title: '🗂  Unmount virtual folders',
      enabled: true,
      checked: false
    }
  };
  const FUSE_STATUS_MOUNTING = {
    type: 'update-item',
    seq_id: 2,
    item: {
      title: '🗂  Mounting virtual folders...',
      enabled: false,
      checked: false
    }
  };

  const tray = new Tray({
    menu: {
      icon: fs.readFileSync(path.join(__dirname, '../assets/images/favicon.png')).toString('base64'),
      title: '🝰 dusk',
      tooltip: '🝰 dusk',
      items: [
        NET_STATUS_CONNECTING.item,
        {
          title: '🔍  Show network info',
          enabled: true,
          checked: false
        },
        {
          title: '🔗  Manage device links',
          enabled: true,
          checked: false
        },
        FUSE_STATUS_NOT_MOUNTED.item,
        {
          title: '🔑  Encryption utilities',
          enabled: true,
          check: false
        },
        {
          title: '👟 USB sneakernet tools',
          enabled: true,
          checked: false
        },
        {
          title: '🗜  Edit preferences',
          enabled: true,
          checked: false
        },
        {
          title: '🗒  View debug logs',
          enabled: true,
          checked: false
        },
        {
          title: '🔌  Disconnect and exit',
          checked: false,
          enabled: true
        }
      ]
    },
    debug: false,
    copyDir: false
  });
 
  tray.onClick(action => {
    switch (action.seq_id) {
      case 0: // Status indicator
        break;
      case 1: // Show network info
        showNetworkInfo(action);
        break;
      case 2: // Link peer device
        manageDeviceLinks(action);
        break;
      case 3: // Mount virtual folders
        toggleMountVirtualFolders(action);
      case 4: // Encryption tools dialogs
        encryptionUtilities(action);
        break;
      case 5: // Sneakernet setup, shred and retracing
        createSneakernet(action);
        break;
      case 6: // Edit preferences
        editPreferences(action);
        break;
      case 7: // View debug logs
        viewDebugLogs(action);
        break;
      case 8: // Disconnect and exit
        disconnectAndExit(action); 
        break;
      default:
        // noop
    } 
  });

  function showNetworkInfo(action) {

  }

  function manageDeviceLinks(actions) {

  }

  function toggleMountVirtualFolders(action) {

  }

  function encryptionUtilities(action) {

  }

  function createSneakernet(action) {
    const tool = Dialog.list(shoesTitle, 'What would you like to do?', [
      ['Setup a new USB drive'], 
      ['Shred a file to sneakernet'],
      ['Retrace a file from sneakernet']
    ], ['Sneakernet Tools'],{ height: 400 });
    
    switch (tool) {
      case 0:
        _dusk(['--usb', '--setup', '--gui']);
        break;
      case 1:
        _dusk(['--usb', '--shred', '--gui']);
        break;
      case 2:
        _dusk(['--usb', '--retrace', '--gui']);
      default:
        // noop
    }
  }

  function editPreferences(actions) {

  }

  function viewDebugLogs(action) {
    _dusk(['--logs', '--gui']);    
  }

  function disconnectAndExit(action) {
    const confirm = Dialog.info('You will be disconnected from dusk.', 'Exit?', 'question');
    if (confirm.status === 0) {
      exitGracefully();
    }
  }

  return {
    tray,
    NET_STATUS_CONNECTING,
    NET_STATUS_LISTENING,
    NET_STATUS_CONNECTED,
    FUSE_STATUS_MOUNTED,
    FUSE_STATUS_NOT_MOUNTED,
    FUSE_STATUS_MOUNTING
  };
};

module.exports = _init;
