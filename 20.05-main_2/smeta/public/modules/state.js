// modules/state.js

export const AppState = {
    currentUser: null,
    currentFile: null,
    lastSessionId: null,
    currentResults: [],
    currentFilter: 'all',
    currentProjectId: null,
    currentProject: null,
    allProjects: [],
    filteredProjects: [],
    currentTab: 'projects',
    projectSessions: [],
    ks2Files: [], 
    currentViewSessionId: null,
    currentProjectFilter: 'all',
    projectsLoaded: false,
    currentCheckMode: 'universal',
    detailedPositionsData: null
};

export function updateState(key, value) {
    if (AppState.hasOwnProperty(key)) {
        AppState[key] = value;
    }
}

export function getState(key) {
    return AppState[key];
}

export function resetState() {
    AppState.currentFile = null;
    AppState.lastSessionId = null;
    AppState.currentResults = [];
    AppState.currentFilter = 'all';
    AppState.currentViewSessionId = null;
    AppState.detailedPositionsData = null;
}