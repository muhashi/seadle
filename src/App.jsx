import React, { useState, useEffect, useRef } from 'react';
import { Alert, Stack, Text, Paper, Group, Badge, Anchor, Grid, Modal, ActionIcon, Switch, Button } from '@mantine/core';
import { useMediaQuery, useDisclosure } from '@mantine/hooks';
import { geoCentroid, geoDistance, geoOrthographic, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import * as topojson from 'topojson-client';
import ConfettiExplosion from 'react-confetti-blast';
import { IconCoffee, IconHelp } from '@tabler/icons-react';

import SeaForm from './SeaForm.jsx';
import SeaRegionsJSON from './data/sea-regions.topo.json';
import wordlist from './data/wordlist.json';
import './App.css';

const Help = () => {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Modal opened={opened} onClose={close} title="How to Play" centered>
        <Text mb="md">
          Guess the <span style={{color: '#002a4a', fontWeight: 'bold'}}>sea of the day</span> in as few attempts as possible! Use the search box to find and select a sea.
        </Text>
        <Text mb="md">
          After making a guess, the sea will be <span style={{color: '#002a4a', fontWeight: 'bold'}}>highlighted on the globe</span>. The darker the colour, the closer your guess is to the target sea. The colour will turn <span style={{color: '#f04e2e', fontWeight: 'bold'}}>red</span> if your guessed sea borders the target sea.
        </Text>
        <Text mb="md">
          You can drag the globe to rotate it and zoom in/out using pinch or scroll. Hover over your guessed seas to see their names and distances from the target sea. Distance is based on the distance between the center of the seas.
        </Text>
      </Modal>

      <ActionIcon variant="transparent" c="#002a4a" onClick={open}>
        <IconHelp />
      </ActionIcon>
    </>
  );
};

const Header = () => {
  const isMobile = useMediaQuery(`(max-width: 485px)`);

  return (<header style={{ textAlign: 'center', marginBottom: '20px' }}>
    <Grid justify="center" align="center">
      <Grid.Col span={1}>
        <Anchor style={{ marginLeft: 'auto' }} href="https://ko-fi.com/muhashi" target="_blank" underline="none" title="Buy me a coffee">
          <IconCoffee color="#002a4a" />
        </Anchor>
      </Grid.Col>
      <Grid.Col span={10}>
        <Group justify="center" spacing="xs" style={{ marginBottom: '8px' }}>
          <Text style={{visibility: 'hidden', display: isMobile ? 'none' : 'block'}}>by muhashi</Text>
          <Text
            component="h1"
            size="3rem"
            style={{ marginBottom: '8px', color: '#002a4a', fontFamily: 'Comic Sans MS, Comic Sans, Chalkboard SE, Chalkboard, Arial', fontWeight: 'bold', userSelect: 'none' }}
            onClick={() => {const divs = [...document.getElementsByClassName("bounce-text-span")]; divs.forEach(div => {div.style.animation = "none"; div.offsetHeight; div.style.animation = null;});}}
          >
            <div className="bounce-text"><span className="bounce-text-span">S</span><span className="bounce-text-span">e</span><span className="bounce-text-span">a</span><span className="bounce-text-span">d</span><span className="bounce-text-span">l</span><span className="bounce-text-span">e</span></div>
          </Text>
          <Text fs="italic" c="dimmed">
            by <Anchor c="blue" href="https://muhashi.com/" target="_blank" underline="always">muhashi</Anchor>
          </Text>
        </Group>
      </Grid.Col>
      <Grid.Col span={1}>
        <Help />
      </Grid.Col>
    </Grid>
    <Text component="p" size="md" c="dimmed">
      Guess the sea of the day!
    </Text>
  </header>);
};

const ShareButton = ({ dayNumber, guesses }) => {
  const [buttonText, setButtonText] = useState('Share');

  const getEmojiForDistance = (distance) => {
    const ratio = Math.min(distance / 20000, 1);

    if (ratio === 0) return '🟩';
    if (ratio < 0.1) return '🟥';
    if (ratio < 0.4) return '🟧';
    if (ratio < 0.6) return '🟨';
    return '⬜';
  };

  const shareGame = () => {
    const text = `Seadle ${dayNumber} - ${guesses.length} guesses\n\n${guesses.map(({distance}) => getEmojiForDistance(distance)).join('')}\n\nhttps://seadle.muhashi.com/`;
    if (navigator.share) {
      navigator.share({
        title: 'Seadle',
        text: text
      });
    } else {
      navigator.clipboard.writeText(text);
    }
    setButtonText('✓ Copied');
    setTimeout(() => {
      setButtonText('Share');
    }, 1000);
  };

  return (
    <Button variant="filled" onClick={shareGame} size="lg">
      {buttonText}
    </Button>
  );
};

const SeadleGame = () => {
  const svgRef = useRef();
  const [guesses, setGuesses] = useState([]);
  const [gameWon, setGameWon] = useState(false);
  const [seaData, setSeaData] = useState(null);
  const [targetSeaNeighbours, setTargetSeaNeighbours] = useState(null);
  const [targetSea, setTargetSea] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null
  });
  const [distanceFormatKm, setDistanceFormatKm] = useState(localStorage.getItem('distanceFormatKm') === 'true' || true);
  const [displayAllNames, setDisplayAllNames] = useState(localStorage.getItem('displayAllNames') === 'true' || false);

  const projectionRef = useRef(null);
  const pathRef = useRef(null);
  const updatePathsRef = useRef(null);
  const guessedPathsRef = useRef(null);
  const globeBackgroundRef = useRef(null);
  const isDraggingRef = useRef(false);

  const HOVER_STROKE = '#000';
  const HOVER_STROKE_WIDTH = 2;
  const HOVER_FILL_OPACITY = 0.8;
  const MAX_TILT = 80;

  const getDayNumber = () => {
    const epoch = new Date(2025, 11, 22); // Created on 12th Dec 2025!
    const today = new Date();
    today.setHours(0, 0, 0); // Make sure both dates are on same time of 00:00:00
    const msPerDay = 1000 * 60 * 60 * 24;
    const dayNumber = Math.round((today.getTime() - epoch.getTime()) / msPerDay);
    return dayNumber;
  };

  // Load data
  useEffect(() => {
    const geojson = topojson.feature(SeaRegionsJSON, SeaRegionsJSON.objects.seas);
    setSeaData(geojson);

    const savedGame = localStorage.getItem(`seadle-${getDayNumber()}`);
    
    if (savedGame) {
      const saved = JSON.parse(savedGame);
      setGuesses(saved.guesses);
      setGameWon(saved.gameWon);
    }
    const todaysSeaName = wordlist[getDayNumber() % wordlist.length]
    const todaysSeaData = geojson.features.find(
      f => f.properties.NAME.toLowerCase() === todaysSeaName.toLowerCase()
    );
    setTargetSea(todaysSeaData);

    const neighbours = topojson.neighbors(SeaRegionsJSON.objects.seas.geometries);
    const targetNeighbours = [...neighbours[geojson.features.findIndex(f => f.properties.NAME === todaysSeaData.properties.NAME)]];
    const targetNeighbourNames = targetNeighbours.map(i => geojson.features[i].properties.NAME);
    setTargetSeaNeighbours(targetNeighbourNames);
  }, []);

  // Save game state
  useEffect(() => {
    if (targetSea) {
      localStorage.setItem(`seadle-${getDayNumber()}`, JSON.stringify({
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

  const getDistanceText = (distanceKm) => {
    return `${Math.round(distanceFormatKm ? distanceKm : distanceKm * 0.621371)} ${distanceFormatKm ? 'km' : 'miles'}`;
  }

  const getColorForDistance = (distance, maxDistance) => {
    const ratio = Math.min(distance / maxDistance, 1);

    const exponentialRatio = 1 - Math.pow(1 - ratio, 3);

    const r = Math.round(173 + (13 - 173) * (1 - exponentialRatio));
    const g = Math.round(216 + (75 - 216) * (1 - exponentialRatio));
    const b = Math.round(230 + (145 - 230) * (1 - exponentialRatio));
    return `rgb(${r}, ${g}, ${b})`;
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

      projection.rotate(clampRotation([
        interpolate(currentRotation[0], targetRotation[0], t),
        interpolate(currentRotation[1], targetRotation[1], t),
        0
      ]));

      updatePaths();

      if (t < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  const showTooltip = (event, data) => {
    const bounds = svgRef.current.getBoundingClientRect();

    setTooltip({
      visible: true,
      x: event.clientX - bounds.left + 12,
      y: event.clientY - bounds.top + 12,
      content: data
    });
  };

  const hideTooltip = () => {
    setTooltip(t => ({ ...t, visible: false }));
  };

  const clampRotation = (rotation) => {
    return [
      rotation[0],
      Math.max(-MAX_TILT, Math.min(MAX_TILT, rotation[1])),
      rotation[2] ?? 0
    ];
  };

  const addHoverHandler = () => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);
    const guessedByName = new Map(
      guesses.map(g => [g.name, g])
    );

    svg.selectAll('.sea')
      .each(function (d) {
        const pathSel = select(this);
        const guess = guessedByName.get(d.properties.NAME);
        const notGuessedData = { name: d.properties.NAME, distance: null, isNeighbour: false };

        // Base styling
        if (guess) {
          pathSel
            .attr('fill', guess.color)
            .attr('stroke', '#333')
            .attr('stroke-width', 1);
        } else {
          pathSel
            .attr('fill', '#e0f2ff')
            .attr('stroke', '#999')
            .attr('stroke-width', 1);
        }

        // Shared hover highlight
        pathSel
          .style('cursor', 'pointer')
          .on('mouseenter', function (event) {
            pathSel
              .raise()
              .attr('stroke', HOVER_STROKE)
              .attr('stroke-width', HOVER_STROKE_WIDTH)
              .attr('fill-opacity', HOVER_FILL_OPACITY);

            // Tooltip only for guessed seas
            if (guess) {
              showTooltip(event, guess);
            } else if (displayAllNames) {
              showTooltip(event, notGuessedData);
            }
          })
          .on('mousemove', function (event) {
            if (!guess && !displayAllNames) return;

            const bounds = svgRef.current.getBoundingClientRect();
            if (guess) {
              showTooltip(event, guess);
            } else if (displayAllNames) {
              showTooltip(event, notGuessedData);
            }
            setTooltip(t => ({
              ...t,
              x: event.clientX - bounds.left + 12,
              y: event.clientY - bounds.top + 12
            }));
          })
          .on('mouseleave', function () {
            pathSel
              .attr('stroke', guess ? '#333' : '#999')
              .attr('stroke-width', 1)
              .attr('fill-opacity', 1);

            if (guess || displayAllNames) hideTooltip();
          });
      });
  }

  // Handle guess submission
  const handleGuess = (guessedSeaName) => {
    if (!guessedSeaName.trim() || !seaData || !targetSea || gameWon) return;

    const guessedSea = seaData.features.find(
      f => f.properties.NAME.toLowerCase() === guessedSeaName.toLowerCase()
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

    const isNeighbour = targetSeaNeighbours && targetSeaNeighbours.includes(guessedSea.properties.NAME);

    const color = isNeighbour ? '#f04e2e' : (guessedSeaName === targetSea.properties.NAME ? '#219900' : getColorForDistance(distance, maxDistance));

    const newGuess = {
      name: guessedSea.properties.NAME,
      distance,
      color,
      feature: guessedSea,
      isNeighbour,
    };

    setGuesses([...guesses, newGuess]);
    rotateToFeature(guessedSea);

    if (guessedSea.properties.NAME === targetSea.properties.NAME) {
      setGameWon(true);
    }
  };

  // Draw globe
  useEffect(() => {
    if (!seaData || !svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = Math.min(600, width);

    select(svgRef.current).selectAll('*').remove();

    const svg = select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const radius = Math.min(width, height) / 2 * 0.9;

    const projection = geoOrthographic()
      .scale(radius)
      .translate([width / 2, height / 2])
      .rotate([0, 0]);

    const path = geoPath().projection(projection);

    projectionRef.current = projection;
    pathRef.current = path;

    // Draw globe backrgound
    const globeBackground = svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', projection.scale())
      .attr('fill', '#d0f2d7');

    globeBackgroundRef.current = globeBackground;

    // Draw all seas faintly
    const seaPaths = svg.append('g').attr('class', 'all-seas');

    seaPaths.selectAll('.sea')
      .data(seaData.features, d => d.properties.NAME)
      .enter()
      .append('path')
      .attr('class', 'sea')
      .attr('data-name', d => d.properties.NAME)
      .attr('d', path)
      .attr('fill', '#e0f2ff')
      .attr('stroke', '#999')
      .attr('stroke-width', 1)
      .style('cursor', 'default');

    const updatePaths = () => {
      globeBackgroundRef.current
        .attr('r', projection.scale());

      seaPaths.selectAll('.sea')
        .attr('d', path);
    };
    updatePathsRef.current = updatePaths;

    // Track previous position for drag
    let lastX = null;
    let lastY = null;

    // Combined zoom and drag behavior
    const zoomBehavior = zoom()
      .scaleExtent([0.5, 8])
      .filter((event) => {
        // Allow all zoom events (including pinch)
        if (event.type === 'wheel') return true;
        if (event.type.startsWith('touch')) return true;
        // Allow mouse drag only with primary button
        if (event.type.startsWith('mouse')) return !event.button;
        return true;
      })
      .on('start', (event) => {
        isDraggingRef.current = true;
        hideTooltip();

        // Track if this is a zoom gesture (2+ touches) or drag (1 touch)
        if (event.sourceEvent?.touches?.length > 1) {
          svg.classed('zooming', true);
          lastX = null;
          lastY = null;
        } else {
          svg.classed('zooming', false);
          // Initialize position tracking
          if (event.sourceEvent?.touches?.[0]) {
            lastX = event.sourceEvent.touches[0].clientX;
            lastY = event.sourceEvent.touches[0].clientY;
          } else if (event.sourceEvent) {
            lastX = event.sourceEvent.clientX;
            lastY = event.sourceEvent.clientY;
          }
        }
      })
      .on('zoom', (event) => {
        const transform = event.transform;
        
        // Handle zoom (scale changes)
        if (event.sourceEvent?.touches?.length > 1 || event.sourceEvent?.type === 'wheel' || svg.classed('zooming')) {
          projection.scale(radius * transform.k);
          updatePathsRef.current();
        } 
        // Handle drag (rotation) for single touch or mouse
        else if (event.sourceEvent) {
          let currentX, currentY;
          
          if (event.sourceEvent.touches?.[0]) {
            currentX = event.sourceEvent.touches[0].clientX;
            currentY = event.sourceEvent.touches[0].clientY;
          } else {
            currentX = event.sourceEvent.clientX;
            currentY = event.sourceEvent.clientY;
          }
          
          if (lastX !== null && lastY !== null) {
            const dx = currentX - lastX;
            const dy = currentY - lastY;
            
            const currentRotation = projection.rotate();
            const currentRadius = projection.scale();
            const scale = 360 / (2 * Math.PI * currentRadius);

            const newRotation = [
              currentRotation[0] + dx * scale,
              currentRotation[1] - dy * scale,
              currentRotation[2]
            ];

            projection.rotate(clampRotation(newRotation));
            updatePaths();
          }
          
          lastX = currentX;
          lastY = currentY;
        }
      })
      .on('end', () => {
        lastX = null;
        lastY = null;
        // Small delay to prevent tooltip from showing immediately after drag
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      });

    svg
      .style('touch-action', 'none')
      .call(zoomBehavior)
      .call(zoomBehavior.transform, zoomIdentity.scale(1))
      .on('dblclick.zoom', null);

    addHoverHandler();
  }, [seaData]);

  useEffect(() => {
    addHoverHandler();
  }, [guesses, displayAllNames]);

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
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        select(this)
          .raise()
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('fill-opacity', 0.85);

        showTooltip(event, d);
      })
      .on('mousemove', (event) => {
        const bounds = svgRef.current.getBoundingClientRect();
        setTooltip(t => ({
          ...t,
          x: event.clientX - bounds.left + 12,
          y: event.clientY - bounds.top + 12
        }));
      })
      .on('mouseleave', function () {
        select(this)
          .attr('stroke', '#333')
          .attr('stroke-width', 1)
          .attr('fill-opacity', 1);

        hideTooltip();
      })
      .merge(paths)
      .attr('d', d => path(d.feature));

    paths.exit().remove();
  }, [guesses]);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Header />
      <Stack spacing="md">
        {gameWon && (
          <>
            <ConfettiExplosion
              style={{
                position: 'absolute', top: '50vh', left: '50vw',
              }}
              duration={3000}
              force={0.6}
            />
            <Group justify="center" align="center" gap="md">
              <Alert variant="light" color="green" styles={{ message: { color: '#194d03' }, width: '100%' }}>
                🎉 Congratulations! You found {targetSea.properties.NAME} in {guesses.length} guesses!
              </Alert>
              <ShareButton dayNumber={getDayNumber()} guesses={guesses} />
            </Group>
          </>
        )}

        {!gameWon && (
          <div style={{ position: 'relative' }}>
              <SeaForm
                onSubmit={handleGuess}
                guessedSeas={guesses}
              />
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <svg ref={svgRef} style={{ border: '1px solid #ddd', borderRadius: '8px', background: 'radial-gradient(circle,#57C1EB 40%, #246FA8 100%)', width: '100%', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}></svg>
          {tooltip.visible && tooltip.content && (
            <Paper
              shadow="md"
              p="xs"
              radius="sm"
              style={{
                position: 'absolute',
                left: tooltip.x,
                top: tooltip.y,
                pointerEvents: 'none',
                touchAction: 'none',
                zIndex: 10,
                background: 'rgba(255, 255, 255, 0.95)'
              }}
            >
              <Text size="sm" weight={600}>
                {tooltip.content.name}
              </Text>
              {tooltip.content.distance !== null && (
                <Text size="xs" c="dimmed">
                  {tooltip.content.isNeighbour ? `Borders` : `${getDistanceText(tooltip.content.distance)} away`}
                </Text>
              )}
            </Paper>
          )}
        </div>

        { guesses.length > 0 &&
          <Paper p="md" withBorder>
            <Group justify="space-between" mb="sm">
              <Text weight={700} mb="sm">Guesses: {guesses.length}</Text>
              <Switch
                checked={distanceFormatKm}
                onChange={(event) => {setDistanceFormatKm(event.currentTarget.checked); localStorage.setItem('distanceFormatKm', event.currentTarget.checked);}}
                label={distanceFormatKm ? "Distance in Kilometers" : "Distance in Miles"}
                labelPosition="left"
                size="md"
              />
            </Group>
            <Group gap="xl">
              {guesses.toSorted((a, b) => {
                if (a.distance === 0 && b.distance !== 0) return -1;
                if (b.distance === 0 && a.distance !== 0) return 1;

                if (a.isNeighbour && !b.isNeighbour) return -1;
                if (b.isNeighbour && !a.isNeighbour) return 1;

                return a.distance - b.distance;
              }).map((g, i) => (
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
                    <Text size="sm">{g.isNeighbour ? `Borders` : `${getDistanceText(g.distance)}`}</Text>
                  </Group>
                </Group>
              ))}
            </Group>
          </Paper>
        }

        { guesses.length > 0 &&
          <Paper p="md" withBorder>
            <Text style={{ fontWeight: "bold" }} mb="sm">Difficulty Settings</Text>
            <Group justify="space-between" mb="sm">
              <Switch
                checked={displayAllNames}
                onChange={(event) => {setDisplayAllNames(event.currentTarget.checked); localStorage.setItem('displayAllNames', event.currentTarget.checked);}}
                label="Display all sea names on hover"
                labelPosition="left"
                size="md"
              />
            </Group>
          </Paper>
        }
      </Stack>
    </div>
  );
};

export default SeadleGame;
