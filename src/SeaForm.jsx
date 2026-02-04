import React, { useState } from 'react';

import { Select, Button, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import wordlist from './data/wordlist.json';

function SeaForm({ onSubmit, guessedSeas }) {
  const [sea, setSea] = useState('');
  const isMobile = useMediaQuery(`(max-width: 485px)`);

  return (
    <form style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); onSubmit(sea); setSea(null);}}>
      <Group style={{ width: '100%' }} spacing="sm" noWrap justify="center">
        <Button size="md" variant="contained" type="submit" style={{visibility: 'hidden', display: isMobile ? 'none' : 'block'}} disabled>Guess</Button> {/* hidden button for centering */}
        <Select
          data={[...wordlist].filter(sea => !guessedSeas.some(({name}) => sea === name)).sort((a, b) => a.localeCompare(b))}
          autoSelectOnBlur
          searchable
          clearable
          withCheckIcon={false}
          rightSection={null}
          comboboxProps={{ transitionProps: { transition: 'pop', duration: 200 }, shadow: 'md' }}
          placeholder="Search a sea..."
          onChange={(_value, option) => setSea(option?.value)}
          size="md"
          value={sea ?? null}
        />
        <Button size="md" variant="contained" type="submit">Guess</Button>
      </Group>
    </form>
  );
}

export default SeaForm;
