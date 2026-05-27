// Jest stub for @sentry/react-native (a native module that can't load in the node test env). The
// pure pricing/command tests import logger → Sentry transitively; this keeps them runnable.
export const init = () => {};
export const wrap = <T>(c: T): T => c;
export const captureException = () => {};
export const mobileReplayIntegration = () => ({});
export const feedbackIntegration = () => ({});
