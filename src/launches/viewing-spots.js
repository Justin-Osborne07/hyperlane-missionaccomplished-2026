// =============================================================================
// viewing-spots.js  (Colby)
// -----------------------------------------------------------------------------
// Popular places to watch a launch from each launch site, with cost and
// what's good about each one. The lists are keyed by the launch site ids in
// Justin's launch-pads.js.
//
// Sources: NASA Wallops Visitor Center, Virginia Space, Chincoteague Chamber
// of Commerce, Explore Lompoc, Vandenberg Space Force Base public affairs,
// and the team's own research for the Kennedy / Cape Canaveral spots.
//
// Coordinates are approximate (good enough for a map pin).
// Prices and access change, and some spots close for certain launches,
// so always check official launch pages before you go.
//
// cost.kind decides the colour of the price tag in the panel:
//   'free'       -> free to visit
//   'fee'        -> small entrance or parking fee
//   'admission'  -> included with a paid attraction ticket
//   'ticket'     -> a special paid launch-viewing ticket
// =============================================================================


export const viewingSpots = {

  // ---------------------------------------------------------------------------
  // Cape Canaveral / Kennedy Space Center, Florida
  // ---------------------------------------------------------------------------
  cape: [
    {
      name: 'Banana Creek (Apollo/Saturn V Center)',
      lat: 28.6063, lon: -80.6774,
      cost: { kind: 'ticket', label: 'Paid ticket + admission' },
      perks: 'Closest official public viewing, with live commentary',
    },
    {
      name: 'Atlantis Lawn (KSC Visitor Complex)',
      lat: 28.5241, lon: -80.6820,
      cost: { kind: 'admission', label: 'Included with admission' },
      perks: 'Big screens and a family atmosphere',
    },
    {
      name: 'Space View Park, Titusville',
      lat: 28.6131, lon: -80.8064,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Free parking and a live audio broadcast',
    },
    {
      name: 'Jetty Park, Port Canaveral',
      lat: 28.4078, lon: -80.5917,
      cost: { kind: 'fee', label: 'Entrance fee' },
      perks: 'Oceanfront views and amenities',
    },
    {
      name: 'Orlando',
      lat: 28.5384, lon: -81.3789,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Big city view of the ascent on a clear day',
      city: true,
    },
  ],


  // ---------------------------------------------------------------------------
  // Vandenberg, California
  // Vandenberg is an active military base, so there's no public viewing on
  // base. Lompoc's tourism bureau recommends spots around town.
  // ---------------------------------------------------------------------------
  vandenberg: [
    {
      name: 'Floradale Ave & W Ocean Ave, Lompoc',
      lat: 34.6395, lon: -120.4885,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Officially designated roadside viewing site',
    },
    {
      name: 'Lompoc Airport',
      lat: 34.6656, lon: -120.4675,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Used as an official public viewing site for NASA launches',
    },
    {
      name: 'Allan Hancock College, Lompoc',
      lat: 34.6808, lon: -120.4757,
      cost: { kind: 'free', label: 'Free' },
      perks: 'About 9 miles out, with a partial view of the pad',
    },
    {
      name: 'Santa Barbara',
      lat: 34.4208, lon: -119.6982,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Coastal city view, especially striking at twilight',
      city: true,
    },
    {
      name: 'Los Angeles',
      lat: 34.0522, lon: -118.2437,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Visible from far away when the sky is clear',
      city: true,
    },
  ],


  // ---------------------------------------------------------------------------
  // Wallops Island, Virginia
  // ---------------------------------------------------------------------------
  wallops: [
    {
      name: 'NASA Wallops Visitor Center',
      lat: 37.9415, lon: -75.4655,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Clear view of the pads and live audio from Range Control',
    },
    {
      name: 'Robert Reed Park, Chincoteague',
      lat: 37.9318, lon: -75.3822,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Waterfront park on Main Street',
    },
    {
      name: 'Curtis Merritt Harbor, Chincoteague',
      lat: 37.8979, lon: -75.4050,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Open harbour views across the water',
    },
    {
      name: 'Ocean City, Maryland',
      lat: 38.3365, lon: -75.0849,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Beach town with a good angle for most launches',
      city: true,
    },
    {
      name: 'Virginia Beach',
      lat: 36.8529, lon: -75.9780,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Worth watching for launches heading south',
      city: true,
    },
  ],


  // ---------------------------------------------------------------------------
  // Canso, Nova Scotia
  // Spaceport Nova Scotia isn't launching yet, so there are no official
  // viewing areas. These are nearby communities, not designated sites.
  // ---------------------------------------------------------------------------
  canso: [
    {
      name: 'Canso (town)',
      lat: 45.3369, lon: -60.9970,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Closest community to the planned spaceport',
      city: true,
    },
    {
      name: 'Halifax',
      lat: 44.6488, lon: -63.5752,
      cost: { kind: 'free', label: 'Free' },
      perks: 'Nearest major city',
      city: true,
    },
  ],
};


// Notes shown above the list for sites with special circumstances
export const siteNotes = {
  vandenberg: 'Vandenberg is an active military base, so there is no public viewing on base.',
  canso: "Spaceport Nova Scotia isn't launching yet, so there are no official viewing areas.",
};