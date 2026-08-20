module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PROJECT_ID || config.extra?.eas?.projectId;
  const channel = process.env.EXPO_UPDATE_CHANNEL || 'production';

  return {
    ...config,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: projectId
      ? {
          enabled: true,
          url: `https://u.expo.dev/${projectId}`,
          checkAutomatically: 'ON_LOAD',
          fallbackToCacheTimeout: 2500,
          requestHeaders: {
            'expo-channel-name': channel,
          },
        }
      : {
          enabled: false,
        },
    extra: {
      ...config.extra,
      eas: {
        ...(config.extra?.eas || {}),
        ...(projectId ? { projectId } : {}),
      },
      updateChannel: channel,
    },
  };
};
