# Book A Barber - Real Online System

This is a deployable Node.js + shared JSON storage barber reservation system with:
- customer booking page
- shared reservations on the server
- admin panel
- barber panel
- working days and hours per barber
- available slots only
- reservation editing, deleting, status changes
- customer number ticket

## Quick start

1. Install Node.js from https://nodejs.org
2. Open a terminal inside this folder
3. Run:

```bash
npm install
npm start
```

4. Open: http://localhost:3000

## Default logins

- Admin PIN: `1234`
- Barber PINs:
  - Adam: `1111`
  - Leo: `2222`

## Admin step by step

1. Open `/admin/login`
2. Enter `1234`
3. Change settings:
   - shop name
   - location
   - headline
   - WhatsApp number
   - admin PIN
4. Add or edit barbers
5. Edit barber days, hours, break, and slot minutes
6. Add, edit, or delete reservations

## Barber step by step

1. Open `/barber/login`
2. Choose the barber
3. Enter the barber PIN
4. Save working days and hours
5. View reservations grouped by day and sorted by time
6. Add, edit, delete, or change reservation status

## Important for online launch

This app stores data in `data/store.json`.
When you deploy it, use a host that gives you persistent storage or a persistent disk/volume.
Without persistent storage, reservations can be lost on redeploy.

## Public launch flow

1. Push this project to GitHub
2. Deploy it to a Node.js host
3. Set the start command to:

```bash
npm start
```

4. Make sure the `data` folder is on persistent storage
5. Open your live URL
6. Give that URL to customers

