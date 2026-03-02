import { useEffect, useState } from 'react';
import { SafeAreaView, Text } from 'react-native';

import { bootstrapAppSession } from './src/bootstrap/app-bootstrap';

const App = () => {
  const [status, setStatus] = useState('Booting mobile foundation...');

  useEffect(() => {
    void bootstrapAppSession()
      .then(() => {
        setStatus('MOB foundation ready');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
        const details: string[] = [];

        if (typeof error === 'object' && error !== null) {
          const candidate = error as {
            status?: unknown;
            code?: unknown;
          };

          if (typeof candidate.status === 'number') {
            details.push(`status=${candidate.status}`);
          }

          if (typeof candidate.code === 'string' && candidate.code.length > 0) {
            details.push(`code=${candidate.code}`);
          }
        }

        const diagnostics = details.length > 0 ? ` (${details.join(', ')})` : '';
        setStatus(`Bootstrap failed: ${message}${diagnostics}`);
      });
  }, []);

  return (
    <SafeAreaView>
      <Text>{status}</Text>
    </SafeAreaView>
  );
};

export default App;
