# SmartPark

**Your Space. Someone's Parking.**

SmartPark is a peer-to-peer parking rental platform. Owners list unused parking spaces (driveways, office slots, vacant society slots) and drivers find, book and pay for them by the hour.

Built for the **vihaanX Hackathon** at DTU.

## The problem

- Drivers waste time and fuel searching for parking near markets, offices, hospitals and stations.
- Many private parking spaces sit empty for part of the day, but owners have no easy way to rent them out.

## Our solution

A location-based marketplace with two sides:

- **Drivers** find nearby spaces on a map, compare price and details, book a time slot, pay and check in with an OTP.
- **Owners** list a space with price and available hours, and track bookings and earnings.

## Features in this prototype

- Map-based search with filters (vehicle type, space type, max price) and sorting by distance or price
- "Use my location" to find spaces near you
- Owner listing form with a map picker
- **Complex / Society Parking** listing type: gate, slot number (revealed only after booking), visitor entry process and management approval status
- Time-slot booking with **double-booking prevention** and availability hours
- Price breakdown with the 15% platform commission (owner gets 85%)
- Demo payment, booking confirmation, OTP check-in, cancellation
- Dashboards for drivers (bookings) and owners (listings, bookings received, earnings)
- **Separate login / sign up for drivers and owners** (see below)

## Login system (phone number + OTP)

1. Choose **Find Parking** (driver) or **List a Space** (owner).
2. Enter your mobile number and tap **Send OTP**.
3. Enter the 6-digit OTP.
4. First time only: enter your **name** and **location** (area/city, plus optional GPS). Returning users skip this step.
5. A parking barrier lifts, a car drives through, and the app fades in.

- Driver and owner accounts are separate. The same phone number can be used once on each side.
- Drivers only see Find Parking and My Bookings. Owners only see List a Space and My Listings. Each person only sees their own bookings or listings.
- Your saved location is where the map starts. The session survives a page reload until you press Log out.
- Accounts (name, location, bookings, listings) are stored in this browser's localStorage, so they are not shared between devices yet. Only the OTP check is real.

### Real SMS OTP (Firebase, free to set up)

Until you add keys in `config.js`, the app is in **demo mode** (the OTP is shown on screen). To send real SMS:

1. Go to https://console.firebase.google.com and create a project.
2. Open **Build > Authentication > Get started > Sign-in method**, and enable **Phone**.
3. Open **Project settings > General > Your apps**, add a **Web app** (`</>`), and copy the `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `appId`) into `config.js`.
4. Open **Authentication > Settings > Authorized domains** and add `127.0.0.1` (for Live Server). `localhost` is already there. When you deploy, add your Vercel or GitHub Pages domain too.
5. Run the site through **Live Server** (`http://127.0.0.1:5500`). Real SMS does not work when you double-click `index.html`.

Testing without sending SMS: in **Authentication > Sign-in method > Phone > Phone numbers for testing**, add a number and a fixed code (for example `9876543210` and `123456`). Logging in with that number needs no SMS.

Real SMS to Indian numbers can be limited on Firebase's free plan, so Firebase may ask you to switch the project to the pay-as-you-go (Blaze) plan. Check their current pricing page for the free monthly SMS allowance. If you prefer another provider (MSG91, Twilio Verify, Supabase phone login), only `requestOtp` and `verifyOtp` in `auth.js` need to change.

## Business model

SmartPark earns a **15% commission** on each completed booking.

| Booking | Owner payout (85%) | SmartPark commission (15%) |
|---|---|---|
| Rs 100 | Rs 85 | Rs 15 |

Future revenue: monthly commuter passes, featured listings, society/office management tools, local ads.

## Tech stack

This prototype: plain HTML, CSS and JavaScript, Leaflet and OpenStreetMap for maps, browser localStorage for data.

Planned production stack: React Native, Node.js + Express, Supabase (PostgreSQL, Auth, Storage), Razorpay payments, Firebase Cloud Messaging.

## Run it on your computer

1. Download or clone this repository.
2. Open the folder in VS Code and run `index.html` with the **Live Server** extension (internet is needed for the map and for SMS login).

## Put it online (free)

**Vercel:** sign in at vercel.com with GitHub, click Add New, then Project, import this repository, and click Deploy.

**GitHub Pages:** open the repository Settings, then Pages, choose the `main` branch and Save. Your site appears at `https://<your-username>.github.io/<repository-name>/`.

## Important notes

- Spaces shown are **demo data** with approximate locations.
- Payments are a **demo flow only**. No real money is charged.
- GPS helps find parking but cannot prove a car is in the right space, so check-in uses an OTP (QR or owner confirmation can be added next).
- All data is stored in your own browser, so each user sees their own bookings.

## Roadmap

- Real SMS OTP login with Supabase Auth (replace `auth.js`) and a shared database
- Real payments with Razorpay (test mode first)
- Owner identity and property verification
- Ratings, reviews and dispute handling
- Push notifications, QR check-in, monthly passes, EV charging spaces

## Team

- NILAY SINGH - business model
- PRIYANSHU SINGH - backend
- PRAKHAR MISHRA - frontend
