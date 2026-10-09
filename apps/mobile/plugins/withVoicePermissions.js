const { withInfoPlist } = require("expo/config-plugins");

// The upstream WebRTC plugin adds camera metadata by default; this app uses audio only.
module.exports = function withVoicePermissions(config) {
  return withInfoPlist(config, (config) => {
    delete config.modResults.NSCameraUsageDescription;
    return config;
  });
};
