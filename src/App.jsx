import React, { useState, useEffect, useRef } from 'react';
import { TextInput, Button, Stack, Text, Paper, Group, Badge } from '@mantine/core';
import { geoCentroid, geoDistance, geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import * as topojson from 'topojson-client';
import SeaRegionsJSON from './data/sea-regions.topo.json';

const SeadleGame = () => {
  const svgRef = useRef();
  const [guess, setGuess] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [gameWon, setGameWon] = useState(false);
  const [seaData, setSeaData] = useState(null);
  const [targetSea, setTargetSea] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const projectionRef = useRef(null);
  const pathRef = useRef(null);
  const updatePathsRef = useRef(null);
  const guessedPathsRef = useRef(null);

  const HOVER_STROKE = '#000';
  const HOVER_STROKE_WIDTH = 2;
  const HOVER_FILL_OPACITY = 0.8;

  // Load data
  useEffect(() => {
    const geojson = topojson.feature(SeaRegionsJSON, SeaRegionsJSON.objects.seas);
    setSeaData(geojson);

    // Pick a random sea for today
    const seas = geojson.features;
    const today = new Date().toDateString();
    const savedGame = localStorage.getItem(`seadle-${today}`);
    
    if (savedGame) {
      const saved = JSON.parse(savedGame);
      setTargetSea(saved.targetSea);
      setGuesses(saved.guesses);
      setGameWon(saved.gameWon);
    } else {
      const randomSea = seas[Math.floor(Math.random() * seas.length)];
      setTargetSea(randomSea);
    }
  }, []);

  // Save game state
  useEffect(() => {
    if (targetSea) {
      const today = new Date().toDateString();
      localStorage.setItem(`seadle-${today}`, JSON.stringify({
        targetSea,
        guesses,
        gameWon
      }));
    }
  }, [guesses, gameWon, targetSea]);

  // Calculate distance between two geographic features
  const calculateDistance = (feature1, feature2) => {
    const centroid1 = geoCentroid(feature1);
    const centroid2 = geoCentroid(feature2);
    return geoDistance(centroid1, centroid2) * 6371; // Earth radius in km
  };

  // Get color based on distance
  const getColorForDistance = (distance, maxDistance) => {
    const ratio = distance / maxDistance;
    if (ratio < 0.2) return '#ff0000';
    if (ratio < 0.4) return '#ff6600';
    if (ratio < 0.6) return '#ffaa00';
    if (ratio < 0.8) return '#00aaff';
    return '#0066ff';
  };

  const rotateToFeature = (feature, duration = 750) => {
    if (!projectionRef.current || !updatePathsRef.current) return;

    const projection = projectionRef.current;
    const updatePaths = updatePathsRef.current;

    const [lon, lat] = geoCentroid(feature);
    const currentRotation = projection.rotate();
    const targetRotation = [-lon, -lat, 0];

    // Simple interpolation
    const interpolate = (a, b, t) => a + (b - a) * t * t * (3 - 2 * t);

    const start = performance.now();

    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);

      projection.rotate([
        interpolate(currentRotation[0], targetRotation[0], t),
        interpolate(currentRotation[1], targetRotation[1], t),
        0
      ]);

      updatePaths();

      if (t < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  const isVisible = (feature) => {
    const [lon, lat] = geoCentroid(feature);
    const [cx, cy] = projectionRef.current([lon, lat]);
    return cx !== null && cy !== null;
  };

  const addHoverHandlers = (selection) => {
    selection
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        if (!isVisible(d.feature ?? d)) return;
        select(this)
          .raise()
          .attr('stroke', HOVER_STROKE)
          .attr('stroke-width', HOVER_STROKE_WIDTH)
          .attr('fill-opacity', HOVER_FILL_OPACITY);
      })
      .on('mouseleave', function () {
        select(this)
          .attr('stroke', '#999')
          .attr('stroke-width', 0.5)
          .attr('fill-opacity', 1);
      });
  };

  // Handle guess submission
  const handleGuess = () => {
    if (!guess.trim() || !seaData || !targetSea || gameWon) return;

    const guessedSea = seaData.features.find(
      f => f.properties.NAME.toLowerCase() === guess.toLowerCase()
    );

    if (!guessedSea) {
      alert('Sea not found. Please enter a valid sea name.');
      return;
    }

    if (guesses.find(g => g.name === guessedSea.properties.NAME)) {
      alert('You already guessed this sea!');
      return;
    }

    const distance = calculateDistance(guessedSea, targetSea);
    const maxDistance = 20000; // Max possible distance on Earth

    const newGuess = {
      name: guessedSea.properties.NAME,
      distance,
      color: getColorForDistance(distance, maxDistance),
      feature: guessedSea
    };

    setGuesses([...guesses, newGuess]);
    rotateToFeature(guessedSea);
    setGuess('');
    setSuggestions([]);

    if (guessedSea.properties.NAME === targetSea.properties.NAME) {
      setGameWon(true);
    }
  };

  // Handle input change with autocomplete
  const handleInputChange = (value) => {
    setGuess(value);
    if (value.length > 0 && seaData) {
      const filtered = seaData.features
        .filter(f => 
          f.properties.NAME.toLowerCase().includes(value.toLowerCase()) &&
          !guesses.find(g => g.name === f.properties.NAME)
        )
        .map(f => f.properties.NAME)
        .slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  // Draw globe
  useEffect(() => {
    if (!seaData || !svgRef.current) return;

    const width = 600;
    const height = 600;

    select(svgRef.current).selectAll('*').remove();

    const svg = select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const projection = geoOrthographic()
      .scale(250)
      .translate([width / 2, height / 2])
      .rotate([0, 0]);

    const path = geoPath().projection(projection);

    projectionRef.current = projection;
    pathRef.current = path;

    // Draw ocean
    const ocean = svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', 250)
      .attr('fill', '#e0f2ff');

    // Draw graticule
    const graticule = geoGraticule();
    const graticulePath = svg.append('path')
      .datum(graticule)
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 0.5);

    // Draw guessed seas
    const guessedPaths = svg.append('g')
      .attr('class', 'guessed-seas');

    guesses.forEach(g => {
      guessedPaths.append('path')
        .datum(g.feature)
        .attr('d', path)
        .attr('fill', g.color)
        .attr('stroke', '#333')
        .attr('stroke-width', 1);
    }); 

    guessedPathsRef.current = guessedPaths;

    // Draw all seas faintly
    const seaPaths = svg.append('g').attr('class', 'all-seas');
    seaPaths.selectAll('.sea')
      .data(seaData.features.filter(f => !guesses.find(g => g.name === f.properties.NAME)))
      .enter()
      .append('path')
      .attr('class', 'sea')
      .attr('d', path)
      .attr('fill', 'rgba(200, 200, 200, 0.3)')
      .attr('stroke', '#999')
      .attr('stroke-width', 0.5)
      .call(addHoverHandlers);

    const updatePaths = () => {
      graticulePath.attr('d', path);
      guessedPathsRef.current
        .selectAll('path')
        .attr('d', d => path(d.feature));
      seaPaths.selectAll('.sea').attr('d', path);
    };
    updatePathsRef.current = updatePaths;

    // Add drag to rotate
    const dragd3 = drag()
      .on('drag', (event) => {
        const dx = event.dx;
        const dy = event.dy;
        const currentRotation = projection.rotate();
        const radius = projection.scale();
        const scale = 360 / (2 * Math.PI * radius);

        const newRotation = [
          currentRotation[0] + dx * scale,
          currentRotation[1] - dy * scale,
          currentRotation[2]
        ];

        projection.rotate(newRotation);
        updatePaths();
      });

    svg.call(dragd3);

  }, [seaData]);

  useEffect(() => {
    if (!updatePathsRef.current) return;
    updatePathsRef.current();
  }, [guesses]);

  useEffect(() => {
    if (!guessedPathsRef.current || !pathRef.current) return;

    const guessedPaths = guessedPathsRef.current;
    const path = pathRef.current;

    const paths = guessedPaths
      .selectAll('path')
      .data(guesses, d => d.name);

    paths.enter()
      .append('path')
      .attr('fill', d => d.color)
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .call(addHoverHandlers)
      .merge(paths)
      .attr('d', d => path(d.feature));

    paths.exit().remove();
  }, [guesses]);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Stack spacing="md">
        <Text size="xl" weight={700} align="center">🌊 Seadle</Text>
        <Text align="center" color="dimmed">Guess the sea of the day!</Text>

        {gameWon && (
          <Paper p="md" style={{ background: '#d4edda', border: '1px solid #c3e6cb' }}>
            <Text weight={700} color="green" align="center">
              🎉 Congratulations! You found {targetSea.properties.NAME} in {guesses.length} guesses!
            </Text>
          </Paper>
        )}

        <svg ref={svgRef} style={{ border: '1px solid #ddd', borderRadius: '8px' }}></svg>

        {!gameWon && (
          <div style={{ position: 'relative' }}>
            <Group>
              <TextInput
                placeholder="Enter sea name..."
                value={guess}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGuess()}
                style={{ flex: 1 }}
              />
              <Button onClick={handleGuess}>Guess</Button>
            </Group>
            {suggestions.length > 0 && (
              <Paper shadow="sm" p="xs" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10 }}>
                <Stack spacing={4}>
                  {suggestions.map(s => (
                    <Text
                      key={s}
                      style={{ cursor: 'pointer', padding: '4px 8px' }}
                      onClick={() => {
                        setGuess(s);
                        setSuggestions([]);
                      }}
                    >
                      {s}
                    </Text>
                  ))}
                </Stack>
              </Paper>
            )}
          </div>
        )}

        <Paper p="md" withBorder>
          <Text weight={700} mb="sm">Guesses: {guesses.length}</Text>
          <Stack spacing="xs">
            {guesses.map((g, i) => (
              <Group key={i} position="apart">
                <Badge color={g.distance === 0 ? 'green' : 'gray'}>
                  {g.name}
                </Badge>
                <Group spacing="xs">
                  <div style={{ 
                    width: 20, 
                    height: 20, 
                    background: g.color,
                    border: '1px solid #333',
                    borderRadius: '4px'
                  }}></div>
                  <Text size="sm">{Math.round(g.distance)} km</Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Text size="sm" color="dimmed">
            🔴 Red = Very close | 🟠 Orange = Close | 🟡 Yellow = Medium | 🔵 Blue = Far
          </Text>
        </Paper>
      </Stack>
    </div>
  );
};

export default SeadleGame;
