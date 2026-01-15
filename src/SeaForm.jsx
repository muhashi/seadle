import React, { useState } from 'react';

import { Select, Button, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import wordlist from './data/wordlist.json';

const synonyms = {
  "Gulf of St. Lawrence": ["Gulf of Saint Lawrence"],
  "Irish Sea and St. George's Channel": ["Irish Sea and Saint George's Channel"],
};

function SeaForm({ onSubmit, guessedSeas }) {
  const [sea, setSea] = useState('');
  const isMobile = useMediaQuery(`(max-width: 485px)`);

  const optionsFilter = ({ options, search, limit }) => {
    if (!search.trim()) return [];

    const parts = search.toLowerCase().trim().split(' ');

    const matches = options.filter((option) => {
      const words = option.label.toLowerCase().split(' ');
      return parts.every((p) => words.some((w) => w.includes(p)));
    });

    matches.sort((a, b) => {
      const aLabel = a.label.toLowerCase();
      const bLabel = b.label.toLowerCase();

      const aScore =
        aLabel.startsWith(search.toLowerCase()) ? 0 :
        aLabel.split(' ').some(w => w.startsWith(parts[parts.length - 1])) ? 1 :
        2;

      const bScore =
        bLabel.startsWith(search.toLowerCase()) ? 0 :
        bLabel.split(' ').some(w => w.startsWith(parts[parts.length - 1])) ? 1 :
        2;

      return aScore - bScore || aLabel.localeCompare(bLabel);
    });

    return matches.slice(0, limit);
  };

  return (
    <form style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); onSubmit(sea); setSea(null);}}>
      <Group style={{ width: '100%' }} spacing="sm" noWrap justify="center">
        <Button size="md" variant="contained" type="submit" style={{visibility: 'hidden', display: isMobile ? 'none' : 'block'}} disabled>Guess</Button> {/* hidden button for centering */}
        <Select
          data={[...wordlist].filter(sea => !guessedSeas.some(({name}) => sea === name))}
          autoSelectOnBlur
          searchable
          clearable
          withCheckIcon={false}
          rightSection={null}
          comboboxProps={{ transitionProps: { transition: 'pop', duration: 200 }, shadow: 'md' }}
          placeholder="Search a sea..."
          onChange={(_value, option) => setSea(option?.value)}
          limit={3}
          filter={optionsFilter}
          size="md"
          value={sea ?? null}
        />
        <Button size="md" variant="contained" type="submit">Guess</Button>
      </Group>
    </form>
  );
}

export default SeaForm;
