
let state = {
  cassettes: [],
  selectedCassette: ''
};

export function initUI() {
  return {
    loadCassettesList,
    getState
  };
}

async function loadCassettesList() {
  const response = await fetch('/api/cassettes');
  state.cassettes = await response.json();
  return state.cassettes;
}

function getState() {
  return state;
}
