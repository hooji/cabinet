/* eslint-disable @typescript-eslint/no-require-imports */
const { MakerZIP } = require("@electron-forge/maker-zip");

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ["darwin", "linux", "win32"])],
  plugins: [],
};
