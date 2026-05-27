# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Stripe Customer Portal

To enable subscription self-management (cancel, update payment) from Settings → Subscription:

1. Go to dashboard.stripe.com/settings/billing/portal
2. Toggle Customer portal to Active
3. Enable: cancellations, plan switching, invoice history
4. Save settings

(The proxy also needs `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `APP_URL` set in Railway — see `.env.example`.)

## Error monitoring (Sentry)

1. Create a free account at sentry.io and add a **React Native** project.
2. Copy the DSN.
3. Set `EXPO_PUBLIC_SENTRY_DSN` in the app/Vercel env (client) and `SENTRY_DSN` in Railway (proxy). Sentry is enabled only in production builds (`__DEV__ === false`).

## Push notifications

Uses Expo push (PWA on Android + iOS 16.4+ added to home screen, and native builds). Set `EXPO_PUBLIC_PROJECT_ID` (from `npx expo config --json | grep projectId` or the expo.dev dashboard).

## Multi-location support

The data model supports franchise/multi-location businesses. A headquarters business can have child location businesses (`Business.locationType` of `headquarters`/`location`/`single`, `parentBusinessCode`, `childLocationCodes`, `locationName`). Reps can be assigned to specific locations (`User.assignedLocationCode`). Full UI coming in a future update.

## Onboarding emails

Three lifecycle emails (welcome, day-2 tip, trial-ending) are sent via Resend. The app calls `POST /onboarding/check` (fire-and-forget) on login; the proxy decides which are due from the business `created_at`/trial window and records what it sent in `config.onboardingEmails` so each goes out at most once. Requires `RESEND_API_KEY` (and a verified `FROM_EMAIL`) in Railway.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
