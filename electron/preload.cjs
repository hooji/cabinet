/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("AgentBridgeDesktop", {
  runtime: "electron",
  platform: process.platform,
});
