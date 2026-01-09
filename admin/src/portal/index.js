import { createRoot } from '@wordpress/element';
import App from './App';
import './styles.scss';

const container = document.getElementById('casanova-gestion-reservas-app');

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
