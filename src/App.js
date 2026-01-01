import { useState } from '@wordpress/element';
import { Button, Card, CardBody, CardHeader } from '@wordpress/components';
import ProposalWizard from './components/ProposalWizard';
import GiavMappingAdmin from './components/GiavMappingAdmin';

export default function App() {
  const params = new URLSearchParams(window.location.search || '');
  const page = params.get('page') || '';

  // Mapping UI lives in submenu page=wp-travel-giav-mapping
  if (page === 'wp-travel-giav-mapping') {
    return <GiavMappingAdmin />;
  }

  const [creating, setCreating] = useState(false);

  if (creating) {
    return <ProposalWizard onExit={() => setCreating(false)} />;
  }

  return (
    <div className="wp-travel-giav-app">
      <Card>
        <CardHeader>
          <strong>WP Travel Proposals</strong>
        </CardHeader>
        <CardBody>
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nueva propuesta
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

