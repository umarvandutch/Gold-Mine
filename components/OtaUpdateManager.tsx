import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function OtaUpdateManager() {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastCheckAt = useRef(0);
  const checking = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    const checkAndApplyUpdate = async (force = false) => {
      const now = Date.now();

      if (checking.current) {
        return;
      }

      if (!force && now - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) {
        return;
      }

      checking.current = true;
      lastCheckAt.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();

        if (!result.isAvailable) {
          return;
        }

        const fetched = await Updates.fetchUpdateAsync();

        if (fetched.isNew) {
          await Updates.reloadAsync();
        }
      } catch {
        // A network/update-service problem should never prevent the app opening.
        // The embedded version remains available as the safe fallback.
      } finally {
        checking.current = false;
      }
    };

    void checkAndApplyUpdate(true);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appState.current !== 'active';
      appState.current = nextState;

      if (wasInactive && nextState === 'active') {
        void checkAndApplyUpdate();
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
}
