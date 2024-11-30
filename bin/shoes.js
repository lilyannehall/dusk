'use strict';

const path = require('node:path');
const usb = require('usb');
const drivelist = require('drivelist');
const inquirer = require('inquirer').default;
const mkdirp = require('mkdirp');
const dusk = require('../index.js');
const fs = require('node:fs');

// usb.on('add', (device) => {})
// usb.on('remove', (device) => {})
// const drives = await drivelist.list(); // [device.mountpoints[]]

module.exports.description = `
                    dusk/ 
         .▄▄ ·  ▄ .▄      ▄▄▄ ..▄▄ · 
         ▐█ ▀. ██▪▐█▪     ▀▄.▀·▐█ ▀. 
         ▄▀▀▀█▄██▀▐█ ▄█▀▄ ▐▀▀▪▄▄▀▀▀█▄
         ▐█▄▪▐███▌▐▀▐█▌.▐▌▐█▄▄▌▐█▄▪▐█
          ▀▀▀▀ ▀▀▀ · ▀█▄▀▪ ▀▀▀  ▀▀▀▀

  simple human operated encrypted sneakernet

                    ~ Ⓐ ~
                                           
         N©! 2024 tactical chihuahua 
         licensed under the AGPL-3.0


`;

module.exports.shred = function(dagEntry) {
  return new Promise(async (resolve, reject) => {
    // take a shard array and shoesmanifest and distribute the shards onto
    // shoes usbs through interactive prompt
    const setupQs = [
      {
        type: 'number',
        name: 'numDrives',
        message: 'How many dusk/SHOES USBs are we shredding to?'
      }
    ];
    const setup = await inquirer.prompt(setupQs);
    const shardsPerUsb = Math.ceil(dagEntry.shards.length / setup.numDrives);
    
    let datadir;

    console.log('');
    console.log('  You are user 0, which means this data will be');
    console.log('  encrypted for you and only unlockable using the');
    console.log('  dusk/SHOES USB that is CURRENTLY inserted.');
    console.log('');
    console.log('  If you need other users to be able to unlock this');
    console.log('  file, repeat this process for each user - starting');
    console.log('  with THEIR dusk/SHOES USB from the beginning.');
    console.log('');

    for (let i = 0; i < dagEntry.shards.length; i++) {
      const shard = dagEntry.shards[i];
      const hash = dusk.utils.hash160(shard).toString('hex');
      
      console.log('');
      if (i % shardsPerUsb === 0) {
        if (i + 1 > setup.numDrives) {
          console.log(`  Ok, USER 0, it's you again to finish the process.`);
        } else {
          console.log(`  I'm ready for USER ${i + 1}.`);
        }
        console.log('');
        datadir = await module.exports.mount();
      }

      mkdirp.sync(path.join(datadir, 'shoes.dat'));
      fs.writeFileSync(
        path.join(datadir, 'shoes.dat', `${hash}.part`),
        shard
      );
    }

    console.log('');
    console.log('  All finished! USER 0, you can retrace this file by running:');
    console.log('    [ dusk --retrace --shoes]');
    console.log('');

    resolve();
  });
};

module.exports.retrace = function(program, config) {
  return new Promise((resolve, reject) => {
    // take a duskbundle and a shoesmanifest and return all of the shards
    // from an interactive prompt for usbs
    resolve();
  });
};

module.exports.init = function(program, config) {
  return new Promise((resolve, reject) => {
    const shoesMetaPath = path.join(program.datadir, 'shoes.meta');
    mkdirp.sync(shoesMetaPath);


    
    // does whatever we are gonna do when dusk --shoes instead of s/kad over tor
    // probably create a shoesmanifest from a interactive prompt and set a drive array
    resolve();
  });
}
;
module.exports.mount = function() {
  return new Promise(async (resolve, reject) => {
    console.log('  [ Eject and remove any dusk/SHOES USBs ... ]');
    console.log('');
    const ejected = await inquirer.prompt({
      type: 'confirm',
      name: 'yes',
      message: 'Ready?'
    });

    if (!ejected.yes) {
      console.error('Eject dusk/SHOES USB and try again.');
      return module.exports.mount();
    }

    const drives = (await drivelist.list()).map(d => d.device);

    console.log('');
    console.log('  [ Insert your dusk/SHOES USB ] ');
    console.log('  [ I will wait for you  ♥ ... ]');
    console.log('');

    usb.usb.once('attach', async (device) => {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'inserted',
        message: 'I detected a new usb device, did you insert a drive?'
      }, {
        type: 'confirm',
        name: 'mounted',
        message: 'Okay, make sure it\'s mounted. Does it open in your file manager?'
      }]);

      if (!confirm.inserted) {
        console.warn('That\'s sus, friend, I\'m going to abort this.');
        process.exit(1);
      }

      if (!confirm.mounted) {
        console.warn('Try a different usb drive and start over.');
        process.exit(1);
      }

      const newDrives = (await drivelist.list()).map(d => d.device);
      const drive = newDrives.filter(d => {
        return !drives.includes(d);
      }).pop();

      if (!drive) {
        console.error('I wasn\'t able to find the new USB drive, sorry.');
        process.exit(1);
      }
      
      let datadir;
      const devices = (await drivelist.list());

      for (let i = 0; i < devices.length; i++) {
        if (drive !== devices[i].device) {
          continue;
        }
        datadir = devices[i].mountpoints.shift().path;
      }

      if (!datadir) {
        console.error('I wasn\'t able to find the mount point, sorry.');
        process.exit(1);
      }

      datadir = path.join(datadir, '.dusk');

      console.log(`  Using datadir: ${datadir}`);
      resolve(datadir);
    });
  });
};