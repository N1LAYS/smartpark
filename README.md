# SmartPark

**Your Space. Someone's Parking.**

SmartPark is a peer-to-peer parking rental platform. Owners list unused parking spaces (driveways, office slots, vacant society slots) and drivers find, book and pay for them by the hour.

Built for the **vihaanX Hackathon** at DTU.

## The problem

- Drivers waste time and fuel searching for parking near markets, offices, hospitals and stations.
- Many private parking spaces sit empty for part of the day, but owners have no easy way to rent them out.

## Our solution

A location-based marketplace with two sides:

- **Drivers** search any address on a map, compare price and details, book a time slot, pay and check in with an OTP.
- **Owners** list a space with price and available hours, and track bookings and earnings.

## Features in this prototype

- **Address search bar**: type any area, landmark or address (powered by OpenStreetMap) and the map and results jump to that place. Matching parking spaces are suggested too.
- Map with price pins, filters (vehicle type, space type, max price, distance) and sorting by distance or price
- "Use my location" to find spaces near you
- Owner listing form with an address search and a map picker
- **Complex / Society Parking** listing type: gate, slot number (revealed only after booking), visitor entry process and management approval status
- Time-slot booking with **double-booking prevention** and availability hours
- **Demo payment flow**: choose UPI / Card / Net banking / Wallet, a processing screen, then a receipt with a transaction ID (no real money is charged)
- Price breakdown with the 15% platform commission (owner gets 85%)
- Booking OTP check-in, free cancellation before the start time
- Dashboards for drivers (bookings) and owners (listings, bookings received, earnings)
- **Separate login / sign up for drivers and owners** with a phone number and a demo OTP

## Login system (phone number + demo OTP)

1. Choose **Find Parking** (driver) or **List a Space** (owner).
2. Enter any valid 10-digit mobile number and tap **Send OTP**.
3. The 6-digit OTP is **shown on screen** (no SMS is sent). Tap "Fill it in for me" or type it.
4. First time only: enter your **name** and **area**. Returning users skip this step.
5. A parking barrier lifts, a car drives through, and the app fades in.

- Driver and owner accounts are separate. The same phone number can be used once on each side.
- Drivers only see Find Parking and My Bookings. Owners only see List a Space and My Listings.
- Accounts, listings and bookings are stored in this browser's localStorage, so they are not shared between devices yet.
- To switch between a driver and an owner during a demo, press **Log out** and log in on the other side. Both accounts live in the same browser, so a booking made by a driver appears in the owner's "Bookings received" if the driver booked one of that owner's listings.

## Business model

SmartPark earns a **15% commission** on each completed booking.

| Booking | Owner payout (85%) | SmartPark commission (15%) |
|---|---|---|
| Rs 100 | Rs 85 | Rs 15 |

Future revenue: monthly commuter passes, featured listings, society/office management tools, local ads.

## Tech stack

This prototype: plain HTML, CSS and JavaScript, Leaflet with OpenStreetMap map tiles (Esri as an automatic backup), OpenStreetMap Nominatim for address search, browser localStorage for data. No build step and no API keys.

Planned production stack: React Native, Node.js + Express, Supabase (PostgreSQL, Auth, Storage), Razorpay payments, real SMS OTP, Firebase Cloud Messaging.

## Run it on your computer

1. Download or clone this repository.
2. Double-click `index.html`, or open the folder in VS Code and run it with the **Live Server** extension. Internet is needed for the map and the address search.

## Put it online (free)

**Vercel:** https://smartpark-zeta-eight.vercel.app/

**GitHub Pages:** open the repository Settings, then Pages, choose the `main` branch and Save. Your site appears at `https://<your-username>.github.io/<repository-name>/`.

## Important notes

- Spaces shown are **demo data** with approximate locations.
- The OTP login and the payment are **demos only**. No SMS is sent and no real money is charged.
- GPS helps find parking but cannot prove a car is in the right space, so check-in uses an OTP (QR or owner confirmation can be added next).
- Address search uses the free OpenStreetMap Nominatim service, which is meant for light use.

## Roadmap

- Real SMS OTP login (Supabase Auth, Firebase or MSG91) and a shared database
- Real payments with Razorpay (test mode first)
- Owner identity and property verification
- Ratings, reviews and dispute handling
- Push notifications, QR check-in, monthly passes, EV charging spaces

## Team

- NILAY SINGH - business model
- PRIYANSHU SINGH - backend
- PRAKHAR MISHRA - frontend
