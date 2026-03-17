'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('apexai', {
  version: process.env.npm_package_version || '1.0.0',
});
