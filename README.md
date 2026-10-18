# Searchlight, Nevada

Fly as a desert bird over Searchlight, the old gold-mining town on US-95 between Las Vegas and Laughlin, ringed by Joshua trees with Lake Mohave in the canyon below.

**Play:** https://julianblock.github.io/Searchlight-game/

The terrain, land cover, roads, buildings and trees all come from real survey data. The desert changes with the season and time of day: wildflowers and Joshua tree blooms in spring, white-hot summer afternoons, monsoon storms, rare winter snow, and at night the neon of Terrible's, the McDonald's sign and the gas station canopies glowing on the highway, with the Las Vegas sky-glow and the Luxor beam on the northern horizon.

## Features

- **Real terrain.** USGS elevation and aerial imagery cover Searchlight in high detail, with 400 km of Mojave stretching to the Spring Mountains, the Colorado River and the ranges of Arizona and California. The horizon follows the curvature of the Earth.
- **Physically based sky.** Rayleigh and Mie atmospheric scattering, with sun and moon positions calculated for the real date and place. Includes moon phases, the dark-sky Milky Way, volumetric clouds and desert haze.
- **Sixteen desert birds**, each with researched plumage variants and its own flight model: red-tailed hawk, common raven, golden eagle, turkey vulture, prairie falcon, American kestrel, greater roadrunner, Gambel's quail, great horned owl, burrowing owl, lesser nighthawk, white-throated swift, Costa's hummingbird, osprey, bald eagle and great blue heron.
- **Main Street, hand-built.** Terrible's Roadhouse with its Denny's and highway pylon, the McDonald's pole sign, the Chevron, Terrible's Diesel and Rebel canopies, the El Rey Motel, the welcome signs at each end of town and the Duplex Mine headframe, all lit up at night.
- **Vegetation.** About half a million plants detected from the imagery around town: Joshua trees, Mojave yuccas, creosote, bursage, cholla, catclaw and desert willow in the washes, plus pinyon and juniper on the high ranges, tamarisk along the shore and palms and cottonwoods in town.
- **Wildlife.** Desert bighorn on the crags, wild burros toward the river, coyotes, black-tailed jackrabbits and desert tortoises. Overhead, raven pairs tumble, vultures kettle, swifts race along the cliffs, white pelicans and Canada geese pass through on migration, cormorants work the lake and blackbirds and doves gather in town, all varying by season.
- **Roads and traffic.** Cars, pickups and big rigs drive the real road network, including US-95, Cottonwood Cove Road and the Joshua Tree Highway. Tortoise fencing lines the highways. Headlights and taillights show at night.
- **Searchlight Cemetery.** Rock-ringed miners' graves, wooden crosses, picket pens and plastic flowers under the Joshua trees, behind a barbed-wire fence with a pipe gate arch. After dark, the old miners walk the graves with their carbide lamps.
- **Places.** The menu's Places tab starts you on US-95 rolling into town, at the Duplex Hill overlook, on Main Street, on Cottonwood Cove Road, at the marina, on the Joshua Tree Highway, at Walking Box Ranch, at the cemetery gate, in Cal-Nev-Ari or on Christmas Tree Pass.
- **Weather.** Crystal-clear, clear, desert haze, scattered cloud, overcast, dust storms, rain, monsoon thunderstorms and snow. Rain darkens the caliche and runs in the washes; snow dusts the Joshua trees and melts in the sun. Lightning lights up the desert and its thunder arrives late by the strike's distance.
- **Drive a pickup.** Swap between bird and truck at any time. The truck has a first-person cockpit with live gauges, headlights, wipers and dust trails. It grips on asphalt, slides on gravel and caliche, crawls through sandy washes and over rock, and can wade into the lake (or drown).
- **Lake Mohave.** The Colorado River backed up behind Davis Dam, carved into the terrain at its real shape, reflecting the canyon walls. Birds float and can dive under. The water is cold and clear, with twelve real species: razorback sucker, bonytail, striped bass, threadfin shad, largemouth and smallmouth bass, rainbow trout, channel catfish, bluegill, green sunfish, carp and mosquitofish.
- **Easter eggs and lore.** About thirty discoveries are hidden around Searchlight, with a card for each one you find: spot every fish in the lake and learn the town's founding, the Duplex Mine, Harry Reid's hometown, Clara Bow's Walking Box Ranch, Avi Kwa Ame and more. Visit the cemetery after dark, look north from high above the desert at night, and stand on the summit of the Highland Range to see it erupt as it did 16 million years ago.
- **Procedural sound.** Wind rises with airspeed and whistles in a stoop, and wingbeats are audible. The ambience follows the time, season and terrain: cactus wrens, Gambel's quail, mourning doves, ravens, summer cicadas, crickets that chirp at the right rate for the temperature, spadefoot toads after a monsoon, braying burros and coyotes.

## Controls

| Key | Action |
| --- | --- |
| W / S | Dive / climb |
| A / D | Bank |
| Q / E | Rudder |
| Space | Flap; take off when perched |
| Shift | Tuck and stoop |
| F / Ctrl | Flare, land |
| C | Cycle cameras |
| V | Call |
| M | Mute |
| H | Help |
| G | Switch between bird and truck |
| Esc | Menu |

Driving:

| Key | Action |
| --- | --- |
| W / S | Throttle / brake and reverse |
| A / D | Steer |
| Space | Handbrake |
| Shift | Boost |
| Mouse | Look around |
| C | Cockpit, chase or hood camera |
| L | Headlights |
| V | Horn |

On phones and tablets, on-screen controls replace the keyboard: a floating thumb-stick on the left, action buttons on the right, and buttons along the top for the menu, camera, bird/truck swap and help. The game goes full screen in landscape where the browser allows it, and you can add it to your home screen as an app. Mobile uses lighter rendering automatically; add `?hq` to the URL for full quality, or `?touch` to try the touch controls on a desktop.

## Development

```sh
npm install
npm run dev       # http://localhost:5173
npm run build
npm run data      # rebuild public/data from USGS / USDA / OSM sources
```

Debug URL parameters: `?fly` skips the menu, `?drive` starts in the truck, `?weather=storm` (or `rain`, `snow`, `dust`, …) and `?time=night` pick conditions, `?place=town` (or `overlook`, `main`, `cove`, `lake`, `joshua`, `walkingbox`, `cemetery`, `calnevari`, `christmastree`) picks the start point, and `?free&cam=x,y,z,yaw,pitch` starts a free camera.

Every push to `main` builds and deploys to GitHub Pages through `.github/workflows/pages.yml`.

## Data sources

- Elevation: AWS Terrain Tiles (USGS 3DEP / SRTM)
- Imagery: USGS National Map imagery
- Land cover: USDA NASS Cropland Data Layer
- Roads, buildings, landmarks and masts: © OpenStreetMap contributors
