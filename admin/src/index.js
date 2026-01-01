import { createRoot } from '@wordpress/element';
import App from './App';

const container = document.getElementById('wp-travel-giav-admin');

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
