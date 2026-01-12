import { createRoot } from '@wordpress/element';
import App from './App';
import './styles.scss';

const adminContainer = document.getElementById('wp-travel-giav-admin');
const requestsContainer = document.getElementById('wp-travel-giav-requests');
const requestsSettingsContainer = document.getElementById('wp-travel-giav-requests-settings');

const mountApp = (container, page = '') => {
  if (!container) {
    return;
  }
  const root = createRoot(container);
  root.render(<App page={page} />);
};

mountApp(adminContainer);
mountApp(requestsContainer, 'wp-travel-giav-requests');
mountApp(requestsSettingsContainer, 'wp-travel-giav-requests-settings');
