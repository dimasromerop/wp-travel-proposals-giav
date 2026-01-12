import { createRoot } from '@wordpress/element';
import App from './App';
import './styles.scss';

const adminContainer = document.getElementById('wp-travel-giav-admin');
const requestsContainer = document.getElementById('wp-travel-giav-requests');
const container = adminContainer || requestsContainer;

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
