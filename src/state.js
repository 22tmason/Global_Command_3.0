// state.js
export const state = {
  // pre-game “hovered” country
  pendingCountryId: null,

  // once confirmed
  confirmedCountryId: localStorage.getItem("selectedCountry") || null,

  // actual country data store
  countryData: {},

  // in-game control state
  gameState: {
    playerCountryId: null,
    control: {}
  }
};

window.state = state;
window.updateWarLines && window.updateWarLines();