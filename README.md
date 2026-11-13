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
2. Double-click `index.html` to open it in your browser (internet is needed for the map).

## Put it online (free)

**Vercel:** sign in at vercel.com with GitHub, click Add New, then Project, import this repository, and click Deploy.

**GitHub Pages:** open the repository Settings, then Pages, choose the `main` branch and Save. Your site appears at `https://<your-username>.github.io/<repository-name>/`.

## Important notes

- Spaces shown are **demo data** with approximate locations.
- Payments are a **demo flow only**. No real money is charged.
- GPS helps find parking but cannot prove a car is in the right space, so check-in uses an OTP (QR or owner confirmation can be added next).
- All data is stored in your own browser, so each user sees their own bookings.

## Roadmap

- Supabase login and a shared database
- Real payments with Razorpay (test mode first)
- Owner identity and property verification
- Ratings, reviews and dispute handling
- Push notifications, QR check-in, monthly passes, EV charging spaces

## Team

- NILAY SINGH - business model
- PRIYANSHU SINGH - backend
- PRAKHAR MISHRA - frontend
