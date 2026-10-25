# Badminton Manager (No DB)

Badminton court queue manager with no Firebase and no server. All data
(players, rooms, match history, photos) is saved in the browser you use
(localStorage, see `local-db.js`), so every person or group has their own data.

Limits: data does not sync between devices, and clearing browser data erases it.
