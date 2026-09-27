// Gear interaction, physics, side view, reports, and animation.

// --- LEGO GEAR PLACEMENT CONSTRAINTS ---
// Distances are expressed in LEGO stud units.
const BEAM_VERTICAL_SPACING_STUDS = LEGO_GEOMETRY.BRICK_HEIGHT_STUDS;
const MESH_DISTANCE_TOLERANCE_STUDS = 0.065;
const TOOTH_PHASE_TOLERANCE_CYCLES = 0.06;
const GEAR_ADDENDUM_STUDS = 0.125;
const BUSH_COLLISION_RADIUS_STUDS = 0.46;
const COLLISION_CLEARANCE_STUDS = 0.015;

function normalizeModulo(value, period) {
    if (!Number.isFinite(value) || !Number.isFinite(period) || period <= 0) return 0;
    return ((value % period) + period) % period;
}

function circularDistance(valueA, valueB, period) {
    const delta = Math.abs(normalizeModulo(valueA - valueB, period));
    return Math.min(delta, period - delta);
}

function isToothedGear(gear) {
    return !!gear && gear.type !== 'bush' && Number.isFinite(gear.teeth) && gear.teeth > 0;
}

function getPitchRadius(gear) {
    if (!isToothedGear(gear)) return null;
    return gear.teeth / 16;
}

function getPhysicalRadius(gear) {
    if (!gear) return 0;
    if (gear.type === 'bush') return BUSH_COLLISION_RADIUS_STUDS;
    const pitchRadius = getPitchRadius(gear);
    return pitchRadius === null ? 0 : pitchRadius + GEAR_ADDENDUM_STUDS;
}

function getToothPitchDegrees(gear) {
    return isToothedGear(gear) ? 360 / gear.teeth : null;
}

function gearCenterPosition(item) {
    return {
        x: item.holeIndex,
        y: item.beamIndex * BEAM_VERTICAL_SPACING_STUDS
    };
}

function gearCenterDistance(itemA, itemB) {
    const a = gearCenterPosition(itemA);
    const b = gearCenterPosition(itemB);
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function contactAngleDegrees(fromItem, toItem) {
    const from = gearCenterPosition(fromItem);
    const to = gearCenterPosition(toItem);
    return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
}

function classifyGearPair(itemA, itemB) {
    const actualDistance = gearCenterDistance(itemA, itemB);
    const gearA = itemA.gear;
    const gearB = itemB.gear;

    if (gearA.type === 'bush' || gearB.type === 'bush') {
        const physicalDistance = getPhysicalRadius(gearA) + getPhysicalRadius(gearB);
        return {
            type: actualDistance < physicalDistance - COLLISION_CLEARANCE_STUDS ? 'collision' : 'independent',
            actualDistance,
            requiredDistance: physicalDistance
        };
    }

    if (!isToothedGear(gearA) || !isToothedGear(gearB)) {
        return { type: 'independent', actualDistance, requiredDistance: null };
    }

    const pitchDistance = getPitchRadius(gearA) + getPitchRadius(gearB);
    const distanceError = actualDistance - pitchDistance;

    if (Math.abs(distanceError) <= MESH_DISTANCE_TOLERANCE_STUDS) {
        return {
            type: 'mesh',
            actualDistance,
            requiredDistance: pitchDistance,
            distanceError
        };
    }

    if (distanceError < -MESH_DISTANCE_TOLERANCE_STUDS) {
        return {
            type: 'collision',
            actualDistance,
            requiredDistance: pitchDistance,
            distanceError
        };
    }

    const outerDistance = getPhysicalRadius(gearA) + getPhysicalRadius(gearB);
    if (actualDistance < outerDistance - COLLISION_CLEARANCE_STUDS) {
        return {
            type: 'collision',
            actualDistance,
            requiredDistance: outerDistance,
            distanceError
        };
    }

    return {
        type: 'independent',
        actualDistance,
        requiredDistance: pitchDistance,
        distanceError
    };
}

function toothPhaseAtContact(item, contactAngle) {
    const pitch = getToothPitchDegrees(item.gear);
    if (!pitch) return 0;

    const angle = item.isCandidate
        ? (Number.isFinite(item.gear.angle) ? item.gear.angle : 0)
        : getAxleAngle(item.beamIndex, item.holeIndex);

    return normalizeModulo((contactAngle - angle) / pitch, 1);
}

function gearPairPhaseErrorCycles(itemA, itemB) {
    if (!isToothedGear(itemA.gear) || !isToothedGear(itemB.gear)) return 0;

    const contactAtoB = contactAngleDegrees(itemA, itemB);
    const phaseA = toothPhaseAtContact(itemA, contactAtoB);
    const phaseB = toothPhaseAtContact(itemB, contactAtoB + 180);
    const combined = normalizeModulo(phaseA + phaseB, 1);

    return circularDistance(combined, 0.5, 1);
}

function getGearAtLayer(beamIndex, holeIndex, layer) {
    let gear = boardState[beamIndex] ? boardState[beamIndex][holeIndex] : null;
    let currentLayer = 0;
    while (gear && currentLayer < layer) {
        gear = gear.nextLayer;
        currentLayer++;
    }
    return currentLayer === layer ? gear : null;
}

function collectPlacedGearsAtLayer(layer, excludedBeam = -1, excludedHole = -1) {
    const result = [];
    for (let beamIndex = 0; beamIndex < beamCount; beamIndex++) {
        if (!boardState[beamIndex]) continue;
        for (let holeIndex = 0; holeIndex < 11; holeIndex++) {
            if (beamIndex === excludedBeam && holeIndex === excludedHole) continue;
            const gear = getGearAtLayer(beamIndex, holeIndex, layer);
            if (gear) result.push({ beamIndex, holeIndex, layer, gear });
        }
    }
    return result;
}

function solveCandidateGearAngle(candidate, meshNeighbors) {
    if (!isToothedGear(candidate.gear)) {
        return { ok: true, angle: 0 };
    }

    const pitch = getToothPitchDegrees(candidate.gear);
    const stackHead = boardState[candidate.beamIndex]
        ? boardState[candidate.beamIndex][candidate.holeIndex]
        : null;
    const axleAngle = stackHead ? getAxleAngle(candidate.beamIndex, candidate.holeIndex) : null;

    const requestedAngles = meshNeighbors.map(neighbor => {
        const candidateToNeighbor = contactAngleDegrees(candidate, neighbor);
        const neighborContactAngle = candidateToNeighbor + 180;
        const neighborPhase = toothPhaseAtContact(neighbor, neighborContactAngle);
        const targetCandidatePhase = normalizeModulo(0.5 - neighborPhase, 1);
        return normalizeModulo(candidateToNeighbor - targetCandidatePhase * pitch, pitch);
    });

    if (axleAngle !== null) {
        const axlePhaseAngle = normalizeModulo(axleAngle, pitch);
        const conflictsWithAxle = requestedAngles.some(angle =>
            circularDistance(angle, axlePhaseAngle, pitch) > pitch * TOOTH_PHASE_TOLERANCE_CYCLES
        );

        if (conflictsWithAxle) {
            return { ok: false, reason: 'phase-conflict' };
        }

        candidate.gear.angle = axleAngle;
        const phaseConflict = meshNeighbors.some(neighbor =>
            gearPairPhaseErrorCycles(candidate, neighbor) > TOOTH_PHASE_TOLERANCE_CYCLES
        );
        return phaseConflict
            ? { ok: false, reason: 'phase-conflict' }
            : { ok: true, angle: axleAngle };
    }

    if (requestedAngles.length === 0) {
        return { ok: true, angle: 0 };
    }

    const radians = requestedAngles.map(angle => (angle / pitch) * Math.PI * 2);
    const x = radians.reduce((sum, angle) => sum + Math.cos(angle), 0);
    const y = radians.reduce((sum, angle) => sum + Math.sin(angle), 0);
    if (Math.hypot(x, y) < 1e-6) {
        return { ok: false, reason: 'phase-conflict' };
    }

    const meanAngle = normalizeModulo(Math.atan2(y, x) / (Math.PI * 2) * pitch, pitch);
    const hasConstraintConflict = requestedAngles.some(angle =>
        circularDistance(angle, meanAngle, pitch) > pitch * TOOTH_PHASE_TOLERANCE_CYCLES
    );
    if (hasConstraintConflict) {
        return { ok: false, reason: 'phase-conflict' };
    }

    candidate.gear.angle = meanAngle;
    const phaseConflict = meshNeighbors.some(neighbor =>
        gearPairPhaseErrorCycles(candidate, neighbor) > TOOTH_PHASE_TOLERANCE_CYCLES
    );
    return phaseConflict
        ? { ok: false, reason: 'phase-conflict' }
        : { ok: true, angle: meanAngle };
}

function analyzeGearPlacement(beamIndex, holeIndex, gearTemplate, layer = 0) {
    const candidateGear = {
        ...gearTemplate,
        angle: 0
    };
    const candidate = { beamIndex, holeIndex, layer, gear: candidateGear, isCandidate: true };
    const neighbors = collectPlacedGearsAtLayer(layer, beamIndex, holeIndex);
    const meshNeighbors = [];

    for (const neighbor of neighbors) {
        const relation = classifyGearPair(candidate, neighbor);
        if (relation.type === 'collision') {
            return {
                ok: false,
                reason: 'collision',
                neighbor,
                relation
            };
        }
        if (relation.type === 'mesh') {
            meshNeighbors.push(neighbor);
        }
    }

    const angleResult = solveCandidateGearAngle(candidate, meshNeighbors);
    if (!angleResult.ok) return angleResult;

    return {
        ok: true,
        angle: Number.isFinite(angleResult.angle) ? angleResult.angle : 0,
        meshNeighbors
    };
}

function showPlacementRejection(result) {
    const messageKey = result && result.reason === 'phase-conflict'
        ? 'placementPhaseConflict'
        : 'placementCollision';
    showModal(t(messageKey), t('cannotPlacePart'));
}

function instantiatePlacedGear(gearTemplate, beamIndex, holeIndex, angle) {
    return {
        ...JSON.parse(JSON.stringify(gearTemplate)),
        angle: Number.isFinite(angle) ? angle : getAxleAngle(beamIndex, holeIndex),
        velocity: getAxleVelocity(beamIndex, holeIndex),
        beamIndex,
        holeIndex,
        pointers: gearTemplate.pointers ? [...gearTemplate.pointers] : undefined
    };
}

// --- INTERACTION ---

        function handleHoleClick(beamIndex, holeIndex) {
            if (motorMode) {
                motorPosition = { beamIndex, holeIndex };
                motorMode = false;

                const btn = document.getElementById('motorModeBtn');
                btn.classList.remove('active');
                btn.innerHTML = '⚡ Motor Yerleştir';

                renderBeam();
                updateMotorInfoPanel();
                updateStatus(`Motor Kiriş ${beamIndex + 1}, Delik ${holeIndex + 1}'e yerleştirildi.`);
                return;
            }

            if (deleteMode) {
                if (motorPosition && motorPosition.beamIndex === beamIndex && motorPosition.holeIndex === holeIndex) {
                    motorPosition = null;
                    renderBeam();
                    updateMotorInfoPanel();
                    updateStatus('Motor kaldırıldı.');
                    return;
                }

                if (boardState[beamIndex][holeIndex] !== null) {
                    const gear = boardState[beamIndex][holeIndex];
                    if (gear.nextLayer) {
                        let current = gear;
                        while (current.nextLayer && current.nextLayer.nextLayer) {
                            current = current.nextLayer;
                        }
                        current.nextLayer = null;
                        updateStatus(t('layerRemoved'));
                    } else {
                        boardState[beamIndex][holeIndex] = null;
                        updateStatus(t('gearRemoved', gear.teeth));
                    }
                    renderBeam();
                } else {
                    updateStatus(t('noGearToRemove'));
                }
                return;
            }

            if (toothMode) {
                const template = { type: 'tooth', teeth: 1, color: '#FF7F00', radius: 0.5 };
                addGear(beamIndex, holeIndex, template);
                return;
            }

            if (selectedGearIndex === null) {
                updateStatus(t('selectGearFirst'), true);
                return;
            }

            const template = GEARS[selectedGearIndex];
            const existing = boardState[beamIndex][holeIndex];

            if (existing !== null) {
                let current = existing;
                let layerCount = 1;
                while (current.nextLayer) {
                    current = current.nextLayer;
                    layerCount++;
                }

                if (layerCount >= 2) {
                    showModal(t('maxGearLayers'), t('cannotPlacePart'));
                    return;
                }

                const placement = analyzeGearPlacement(beamIndex, holeIndex, template, layerCount);
                if (!placement.ok) {
                    showPlacementRejection(placement);
                    return;
                }

                current.nextLayer = instantiatePlacedGear(
                    template,
                    beamIndex,
                    holeIndex,
                    placement.angle
                );
                setAxleAngle(beamIndex, holeIndex, placement.angle);

                renderBeam();
                updateStatus(t('layerAdded'));
                return;
            }

            addGear(beamIndex, holeIndex, template);
        }

        function addGear(beamIndex, holeIndex, gearTemplate) {
            const existingGear = boardState[beamIndex][holeIndex];

            if (gearTemplate.type === 'tooth') {
                if (!existingGear) {
                    showModal(t('toothNeedsGear'), t('cannotPlacePart'));
                    return false;
                }

                if (!existingGear.pointers) existingGear.pointers = [];
                if (!existingGear.pointers.includes(currentPointerAngle)) {
                    existingGear.pointers.push(currentPointerAngle);
                    renderBeam();
                }
                return true;
            }

            const placement = analyzeGearPlacement(beamIndex, holeIndex, gearTemplate, 0);
            if (!placement.ok) {
                showPlacementRejection(placement);
                return false;
            }

            boardState[beamIndex][holeIndex] = instantiatePlacedGear(
                gearTemplate,
                beamIndex,
                holeIndex,
                placement.angle
            );
            setAxleAngle(beamIndex, holeIndex, placement.angle);

            renderBeam();
            return true;
        }

        function removeGear(beamIndex, holeIndex) {
            const gear = boardState[beamIndex][holeIndex];
            if (gear) {
                if (gear.nextLayer) {
                    let current = gear;
                    while (current.nextLayer && current.nextLayer.nextLayer) {
                        current = current.nextLayer;
                    }
                    current.nextLayer = null;
                } else {
                    boardState[beamIndex][holeIndex] = null;
                }
            }
            renderBeam();
            validateAndCalculate();
        }

        // --- PHYSICS & LOGIC ---

        function axleKey(beamIndex, holeIndex) {
            return `${beamIndex}_${holeIndex}`;
        }

        function buildAxleRatioEdges(connections) {
            return connections
                .filter(connection => connection.type === 'valid' && Number.isFinite(connection.ratio))
                .map(connection => ({
                    from: axleKey(connection.fromBeam, connection.from),
                    to: axleKey(connection.toBeam, connection.to),
                    ratio: connection.ratio,
                    connection
                }));
        }

        function analyzeRatioGraph(edges, tolerance = 1e-7) {
            const adjacency = new Map();
            const addEdge = (from, to, ratio, source) => {
                if (!adjacency.has(from)) adjacency.set(from, []);
                adjacency.get(from).push({ to, ratio, source });
            };

            edges.forEach(edge => {
                addEdge(edge.from, edge.to, edge.ratio, edge);
                addEdge(edge.to, edge.from, 1 / edge.ratio, edge);
            });

            const potentials = new Map();
            const componentByNode = new Map();
            const conflicts = [];
            let componentId = 0;

            for (const root of adjacency.keys()) {
                if (potentials.has(root)) continue;
                componentId++;
                potentials.set(root, 1);
                componentByNode.set(root, componentId);

                const queue = [root];
                let head = 0;
                while (head < queue.length) {
                    const current = queue[head++];
                    const currentPotential = potentials.get(current);

                    for (const edge of adjacency.get(current) || []) {
                        const expected = currentPotential * edge.ratio;
                        if (!potentials.has(edge.to)) {
                            potentials.set(edge.to, expected);
                            componentByNode.set(edge.to, componentId);
                            queue.push(edge.to);
                            continue;
                        }

                        const existing = potentials.get(edge.to);
                        const scale = Math.max(1, Math.abs(existing), Math.abs(expected));
                        if (Math.abs(existing - expected) > tolerance * scale) {
                            conflicts.push({
                                from: current,
                                to: edge.to,
                                existing,
                                expected,
                                source: edge.source
                            });
                        }
                    }
                }
            }

            return {
                ok: conflicts.length === 0,
                potentials,
                componentByNode,
                conflicts,
                adjacency
            };
        }

        function populateGearConnectionsMap(connections) {
            gearConnectionsMap = {};
            connections
                .filter(connection => connection.type === 'valid' && Number.isFinite(connection.ratio))
                .forEach(connection => {
                    const keyA = axleKey(connection.fromBeam, connection.from);
                    const keyB = axleKey(connection.toBeam, connection.to);
                    if (!gearConnectionsMap[keyA]) gearConnectionsMap[keyA] = [];
                    if (!gearConnectionsMap[keyB]) gearConnectionsMap[keyB] = [];

                    if (!gearConnectionsMap[keyA].find(item => item.k === keyB && item.layer === connection.layer)) {
                        gearConnectionsMap[keyA].push({
                            k: keyB,
                            b: connection.toBeam,
                            h: connection.to,
                            ratio: connection.ratio,
                            layer: connection.layer
                        });
                    }
                    if (!gearConnectionsMap[keyB].find(item => item.k === keyA && item.layer === connection.layer)) {
                        gearConnectionsMap[keyB].push({
                            k: keyA,
                            b: connection.fromBeam,
                            h: connection.from,
                            ratio: 1 / connection.ratio,
                            layer: connection.layer
                        });
                    }
                });
        }

        function propagateMotorAxleVelocities(graphAnalysis) {
            resetAllAxleVelocities();
            if (!motorPosition) return;

            const rootKey = axleKey(motorPosition.beamIndex, motorPosition.holeIndex);
            const rootPotential = graphAnalysis.potentials.get(rootKey);

            // A motor on an isolated axle still drives that axle.
            if (rootPotential === undefined) {
                setAxleVelocity(motorPosition.beamIndex, motorPosition.holeIndex, 1);
                return;
            }

            const rootComponent = graphAnalysis.componentByNode.get(rootKey);
            for (const [key, potential] of graphAnalysis.potentials.entries()) {
                if (graphAnalysis.componentByNode.get(key) !== rootComponent) continue;
                const [beamIndex, holeIndex] = key.split('_').map(Number);
                setAxleVelocity(beamIndex, holeIndex, potential / rootPotential);
            }
        }

        function validateAndCalculate() {
            const connections = [];
            gearConnectionsMap = {};
            let isValid = true;
            let statusMsg = t('gearsPlaced');

            const allGears = [];
            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (!boardState[beamIdx]) continue;
                for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                    let gear = boardState[beamIdx][holeIdx];
                    const isMotorPos = motorPosition &&
                        motorPosition.beamIndex === beamIdx &&
                        motorPosition.holeIndex === holeIdx;

                    let layer = 0;
                    while (gear) {
                        allGears.push({
                            beamIndex: beamIdx,
                            holeIndex: holeIdx,
                            gear,
                            layer,
                            isMotor: isMotorPos && layer === 0
                        });
                        gear = gear.nextLayer;
                        layer++;
                    }
                }
            }

            for (let i = 0; i < allGears.length; i++) {
                for (let j = i + 1; j < allGears.length; j++) {
                    const gearA = allGears[i];
                    const gearB = allGears[j];
                    if (gearA.layer !== gearB.layer) continue;

                    const relation = classifyGearPair(gearA, gearB);

                    if (relation.type === 'collision') {
                        connections.push({
                            fromBeam: gearA.beamIndex,
                            from: gearA.holeIndex,
                            toBeam: gearB.beamIndex,
                            to: gearB.holeIndex,
                            type: 'collision',
                            layer: gearA.layer
                        });
                        isValid = false;
                        statusMsg = t('placementCollision');
                        continue;
                    }

                    if (relation.type !== 'mesh') continue;

                    const phaseError = gearPairPhaseErrorCycles(gearA, gearB);
                    if (phaseError > TOOTH_PHASE_TOLERANCE_CYCLES) {
                        connections.push({
                            fromBeam: gearA.beamIndex,
                            from: gearA.holeIndex,
                            toBeam: gearB.beamIndex,
                            to: gearB.holeIndex,
                            type: 'phase-conflict',
                            layer: gearA.layer
                        });
                        isValid = false;
                        statusMsg = t('placementPhaseConflict');
                        continue;
                    }

                    connections.push({
                        fromBeam: gearA.beamIndex,
                        from: gearA.holeIndex,
                        toBeam: gearB.beamIndex,
                        to: gearB.holeIndex,
                        type: 'valid',
                        layer: gearA.layer,
                        ratio: -(gearA.gear.teeth / gearB.gear.teeth)
                    });
                }
            }

            const ratioGraph = analyzeRatioGraph(buildAxleRatioEdges(connections));
            if (!ratioGraph.ok) {
                isValid = false;
                statusMsg = t('kinematicConflict');
                gearConnectionsMap = {};
                resetAllAxleVelocities();
            } else {
                populateGearConnectionsMap(connections);
                propagateMotorAxleVelocities(ratioGraph);
            }

            renderConnections(connections);

            if (allGears.length === 0) {
                updateStatus('Simülasyon hazır.', false);
            } else if (!isValid) {
                updateStatus(statusMsg, true);
            } else if (connections.some(connection => connection.type === 'valid')) {
                updateStatus('✅ Bağlantı aktif. Mesh hesabı yapıldı.');
            } else {
                updateStatus(t('gearsIndependent'));
            }

            renderSimulationStats();
            renderSideView();

            return { isValid, connections, ratioGraph };
        }

        // Global State for Beam Tab (For Side View Only)
        // activeBeamIndex is defined above

        function switchBeam(index) {
            activeBeamIndex = index;
            renderSideView();
        }

        function renderSideView() {
            const container = document.getElementById('sideViewContainer');
            if (!container) return;

            // Visual constants derived from the same LEGO plan geometry used by the solver.
            const scale = LEGO_GEOMETRY.SIDE_VIEW_SCALE;
            const studSize = STUD_SPACING * scale;
            const beamHeight = LEGO_GEOMETRY.BEAM_HEIGHT_PX * scale;
            const gearHeight = 18; // Profile thickness; independent from plan-view pitch geometry.
            const layerGap = 2;

            // Motor Dimensions
            const motorWidth = 50;
            const motorHeight = 40;
            const motorGap = 4;

            // 1. Generate HTML Tabs
            let tabsHtml = '<div style="display:flex; gap:0; margin-bottom:10px; flex-wrap:wrap; border-bottom:1px solid #e2e8f0;">';
            for (let i = 0; i < beamCount; i++) {
                const isActive = i === activeBeamIndex;
                // Add border radius only to first and last items for a "group" look
                let borderRadius = '0';
                if (i === 0) borderRadius = '6px 0 0 6px';
                if (i === beamCount - 1) borderRadius = '0 6px 6px 0';
                if (beamCount === 1) borderRadius = '6px';

                tabsHtml += `<button onclick="switchBeam(${i})" style="
                    padding: 4px 8px; 
                    border:1px solid ${isActive ? '#0066cc' : '#e2e8f0'}; 
                    /* Prevent double borders if not active, active brings its own full border */
                    margin-right: -1px; 
                    background:${isActive ? '#0066cc' : '#f8fafc'}; 
                    color:${isActive ? '#ffffff' : '#64748b'}; 
                    border-radius: ${borderRadius}; 
                    cursor:pointer; 
                    font-size: 0.8rem;
                    font-weight: 500;
                    min-width: 32px;
                    text-align: center;
                    transition: all 0.1s;
                    z-index: ${isActive ? 10 : 1}; /* Active on top */
                    position: relative;
                ">
                    K${i + 1}
                </button>`;
            }
            tabsHtml += '</div>';

            // 2. Determine Geometry (Dynamic Width)
            let maxLeftSide = 0;
            let maxRightSide = 0;
            const beamPixelWidth = 12 * studSize; // 12 studs wide

            const b = activeBeamIndex; // Focus only on active beam
            if (boardState[b]) {
                for (let h = 0; h < 11; h++) {
                    if (boardState[b][h]) {
                        const gear = boardState[b][h];
                        let current = gear;
                        while (current) {
                            const gearRadiusPx = getPhysicalRadius(current) * STUD_SPACING * scale;
                            // Axle h is between stud h and stud h+1
                            const centerPos = (h * studSize) + studSize;

                            const leftEdge = centerPos - gearRadiusPx;
                            if (leftEdge < 0) maxLeftSide = Math.max(maxLeftSide, Math.abs(leftEdge));

                            const rightEdge = centerPos + gearRadiusPx;
                            if (rightEdge > beamPixelWidth) maxRightSide = Math.max(maxRightSide, rightEdge - beamPixelWidth);

                            current = current.nextLayer;
                        }
                    }
                }
            }

            const paddingLeft = 20 + maxLeftSide;
            const paddingRight = 20 + maxRightSide;

            // Height Calculation (Motor + Beam + Gear Layers)
            // Need to calculate max layer depth for this beam
            let maxLayers = 1;
            if (boardState[b]) {
                for (let h = 0; h < 11; h++) {
                    let l = 0;
                    let g = boardState[b][h];
                    while (g) { l++; g = g.nextLayer; }
                    if (l > maxLayers) maxLayers = l;
                }
            }
            // Height = Motor (Top) + Beam + Layers (Bottom)
            // Motor is above beam. Layers are below beam.
            const svgHeight = motorHeight + 10 + beamHeight + (maxLayers * (gearHeight + layerGap)) + 20;
            const svgWidth = beamPixelWidth + paddingLeft + paddingRight;

            let svgContent = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="overflow:visible;" preserveAspectRatio="xMidYMid meet">`;

            // Draw SINGLE Beam (Active) - Always at Y=0 relative to content
            // Start Y logic: Allow space for Motor on top
            const startY = motorHeight + 10;
            const beamY = startY;
            const gearY = startY + beamHeight + layerGap;

            const colorMap = {
                'blue': '#0056b3', 'red': '#c91a09', 'yellow': '#f59e0b',
                'green': '#16a34a', 'white': '#e2e8f0', 'black': '#1e293b'
            };
            const bColor = colorMap[beamColor] || '#0056b3';

            // 0. CHECK & DRAW MOTOR (Top)
            if (motorPosition && motorPosition.beamIndex === b) {
                const h = motorPosition.holeIndex;
                // Axle position: between stud h and h+1 (centered)
                const centerX = paddingLeft + (h * studSize) + studSize;
                const mY = beamY - motorGap - motorHeight;

                // Motor Axle
                svgContent += `<rect x="${centerX - 3}" y="${mY + motorHeight}" width="6" height="${motorGap + 5}" fill="#facc15" stroke="#ca8a04" stroke-width="0.5" rx="1"/>`;

                // Motor Body
                svgContent += `
                    <rect x="${centerX - motorWidth / 2}" y="${mY}" width="${motorWidth}" height="${motorHeight}" rx="4" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
                    <rect x="${centerX - motorWidth / 2}" y="${mY + motorHeight - 12}" width="${motorWidth}" height="12" rx="2" fill="#0ea5e9" stroke="#0284c7" stroke-width="1" clip-path="inset(0 0 2px 0)"/>
                    <circle cx="${centerX - 12}" cy="${mY + 10}" r="3" fill="#e2e8f0"/>
                    <circle cx="${centerX + 12}" cy="${mY + 10}" r="3" fill="#e2e8f0"/>
                `;
            }

            // 1. Draw Axles (11 axles, positioned between studs)
            if (boardState[b]) {
                for (let h = 0; h < 11; h++) {
                    const gear = boardState[b][h];
                    if (gear) {
                        let layerCount = 0;
                        let current = gear;
                        while (current) { layerCount++; current = current.nextLayer; }

                        const totalHeight = layerCount * (gearHeight + layerGap);
                        // Axle h is between stud h and stud h+1
                        const centerX = paddingLeft + (h * studSize) + studSize;
                        // Standard Axle -> Red
                        svgContent += `<rect x="${centerX - 3}" y="${beamY + beamHeight}" width="6" height="${totalHeight}" fill="#dc2626" stroke="#991b1b" stroke-width="0.5" rx="1"/>`;
                    }
                }
            }

            // 2. Draw Beam (width = 12 studs)
            const beamPixelWidthFull = 12 * studSize;
            svgContent += `<rect x="${paddingLeft}" y="${beamY}" width="${beamPixelWidthFull}" height="${beamHeight}" rx="2" fill="${bColor}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`;

            // 3. Draw 12 Studs (on top of beam surface)
            const studRadius = studSize / 2 - 4;
            for (let s = 0; s < 12; s++) {
                const sx = paddingLeft + s * studSize + studSize / 2;
                const sy = beamY + beamHeight / 2; // Centered vertically in the beam
                svgContent += `
                    <circle cx="${sx}" cy="${sy}" r="${studRadius}" fill="${bColor}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
                `;
            }

            // 4. (Axle Holes removed as per request)

            // 5. Draw Gears (positioned at axle centers)
            if (boardState[b]) {
                for (let h = 0; h < 11; h++) {
                    const gear = boardState[b][h];
                    if (gear) {
                        let current = gear;
                        let layerIdx = 0;

                        while (current) {
                            const currentGearY = gearY + (layerIdx * (gearHeight + layerGap));
                            // Gear center is at axle position (between stud h and h+1)
                            const centerX = paddingLeft + (h * studSize) + studSize;
                            const diameter = getPhysicalRadius(current) * 2 * STUD_SPACING * scale;
                            const gColor = current.color;
                            const dColor = adjustColor(gColor, -20);

                            // Gear Body
                            svgContent += `<rect x="${centerX - diameter / 2}" y="${currentGearY}" width="${diameter}" height="${gearHeight}" rx="2" fill="${gColor}" stroke="${dColor}" stroke-width="1"/>`;

                            // Teeth detail
                            const toothSpacing = 4;
                            const numStripes = Math.floor(diameter / toothSpacing);
                            for (let t = 1; t < numStripes; t++) {
                                svgContent += `<line x1="${centerX - diameter / 2 + t * toothSpacing}" y1="${currentGearY}" x2="${centerX - diameter / 2 + t * toothSpacing}" y2="${currentGearY + gearHeight}" stroke="${dColor}" stroke-width="0.5" opacity="0.6"/>`;
                            }

                            // Draw Pointer (Tooth) if exists or if gear type is tooth
                            if (current.type === 'tooth' || (current.pointers && current.pointers.length > 0) || current.hasPointer) {
                                const ptrHeight = 15;
                                const ptrY = currentGearY + gearHeight;
                                // Draw Orange Pointer Triangle pointing down/outward
                                svgContent += `
                                    <polygon points="${centerX},${ptrY + ptrHeight} ${centerX - 4},${ptrY} ${centerX + 4},${ptrY}" 
                                             fill="#FF7F00" stroke="#9a3412" stroke-width="1"/>
                                `;
                            }
                            current = current.nextLayer;
                            layerIdx++;
                        }
                    }
                }
            }

            svgContent += `</svg>`;
            container.innerHTML = tabsHtml + svgContent;
        }


        function renderConnections(connections) {
            for (let beamIndex = 0; beamIndex < beamCount; beamIndex++) {
                const layer = document.getElementById(`connectionLayer_${beamIndex}`);
                if (layer) layer.innerHTML = '';
            }

            document.querySelectorAll('.beam-hole').forEach(hole => {
                hole.classList.remove('invalid', 'mesh-connected');
            });

            const markHole = (beamIndex, holeIndex, isError) => {
                const hole = document.querySelector(
                    `.beam-hole[data-beam-index="${beamIndex}"][data-hole-index="${holeIndex}"]`
                );
                if (!hole) return;
                hole.classList.toggle('invalid', isError);
                if (!isError) hole.classList.add('mesh-connected');
            };

            connections.forEach(connection => {
                const isError = connection.type !== 'valid';
                markHole(connection.fromBeam, connection.from, isError);
                markHole(connection.toBeam, connection.to, isError);

                // Horizontal connections can be drawn inside one beam. Cross-beam/diagonal
                // constraints are represented by the endpoint states to avoid a misleading line.
                if (connection.fromBeam !== connection.toBeam) return;

                const beamIndex = connection.fromBeam;
                const layer = document.getElementById(`connectionLayer_${beamIndex}`);
                if (!layer) return;

                const firstHole = Math.min(connection.from, connection.to);
                const holeDelta = Math.abs(connection.to - connection.from);
                const startX = AXLE_CENTER_X0_PX + firstHole * STUD_SPACING;
                const width = holeDelta * STUD_SPACING;

                const indicator = document.createElement('div');
                indicator.className = `connection-indicator${isError ? ' error' : ''}`;
                indicator.style.left = `${startX}px`;
                indicator.style.width = `${width}px`;
                layer.appendChild(indicator);
            });
        }

        // --- ANIMATION ENGINE ---

        function toggleSimulation() {
            if (isRunning) {
                stopSimulation();
            } else {
                startSimulation();
            }
        }

        // --- MODAL FUNCTIONS ---
        function showModal(message, title = "Uyarı") {
            const modal = document.getElementById('warningModal');
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalMessage').textContent = message;
            modal.classList.add('active');
        }

        function closeModal(event) {
            // Close if clicked on overlay or close button
            if (!event || event.target.id === 'warningModal' || event.target.classList.contains('modal-btn')) {
                document.getElementById('warningModal').classList.remove('active');
            }
        }

        // Run one full turn (360°) of the motor and generate report
        function runOneTurn() {
            // Check if motor is placed
            if (!motorPosition) {
                showModal(t('motorMissing'), t('motorMissingMsg'));
                return;
            }

            // Validate connections
            const { isValid, connections } = validateAndCalculate();
            if (!isValid) {
                showModal(t('error'), t('conflictGears'));
                return;
            }

            // Collect all gears with their calculated velocities
            const allGears = [];
            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (boardState[beamIdx]) {
                    for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                        let g = boardState[beamIdx][holeIdx];
                        const isMotorPos = motorPosition &&
                            motorPosition.beamIndex === beamIdx &&
                            motorPosition.holeIndex === holeIdx;

                        let layer = 0;
                        while (g) {
                            if (g.type !== 'bush') {
                                allGears.push({
                                    beamIndex: beamIdx,
                                    holeIndex: holeIdx,
                                    gear: g,
                                    layer: layer,
                                    isMotor: isMotorPos && layer === 0,
                                    velocity: g.velocity || 0
                                });
                            }
                            g = g.nextLayer;
                            layer++;
                        }
                    }
                }
            }

            if (allGears.length === 0) {
                showModal(t('noGears'), t('noGearsMsg'));
                return;
            }

            // Calculate report data
            // Motor velocity is 1.0 (reference), others are relative
            const motorGear = allGears.find(g => g.isMotor);
            const baseVelocity = motorGear ? Math.abs(motorGear.velocity) : 1;

            let reportHtml = `
                <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: #0066cc; color: white;">
                                <th style="padding: 8px; border: 1px solid #ccc;">${t("gear")}</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Konum</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Dönüş</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Hız</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Tork</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            allGears.forEach(item => {
                const speedRatio = baseVelocity > 0 ? Math.abs(item.velocity) / baseVelocity : 0;
                const torqueRatio = speedRatio > 0 ? 1 / speedRatio : 0;
                const rotation = 360 * speedRatio; // Degrees when motor does 360°
                const direction = item.velocity >= 0 ? '↻' : '↺';
                const isMotorClass = item.isMotor ? 'background: #fef3c7;' : '';

                reportHtml += `
                    <tr style="${isMotorClass}">
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                            <span style="display: inline-block; width: 12px; height: 12px; background: ${item.gear.color}; border-radius: 50%; margin-right: 4px;"></span>
                            ${item.gear.teeth}T ${item.isMotor ? '⚡' : ''}
                        </td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                            K${item.beamIndex + 1} D${item.holeIndex + 1}${item.layer > 0 ? ' L' + (item.layer + 1) : ''}
                        </td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                            ${direction} ${rotation.toFixed(1)}°
                        </td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                            ${speedRatio.toFixed(2)}x
                        </td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                            ${torqueRatio.toFixed(2)}x
                        </td>
                    </tr>
                `;
            });

            reportHtml += `
                        </tbody>
                    </table>
                    <div style="margin-top: 15px; padding: 10px; background: #f0f9ff; border-radius: 8px; font-size: 0.8rem; color: #0369a1;">
                        <strong>📊 Özet:</strong><br>
                        Motor 1 tur (360°) döndüğünde yukarıdaki dönüşler gerçekleşir.<br>
                        Hız = Dönüş hızı oranı (motor referans).<br>
                        Tork = Güç çarpanı (hızın tersi).
                    </div>
                </div>
            `;

            // Show report in modal
            showReportModal("1 Tur Raporu", reportHtml);
        }

        // Report modal function
        function showReportModal(title, content) {
            const modal = document.getElementById('warningModal');
            modal.querySelector('.modal-title').textContent = title;
            modal.querySelector('.modal-message').innerHTML = content;
            modal.classList.add('active');
        }

        function startSimulation() {
            // 1. Run Physics Engine (Validates & Calculates Velocities)
            const { isValid, connections } = validateAndCalculate();

            if (!isValid) {
                showModal(t('simCannotStart'));
                return;
            }

            // Check if motor is placed
            if (!motorPosition) {
                showModal(t('motorMissingSimMsg'), '⚠️ ' + t('motorMissing'));
                return;
            }

            // Check if there are any gears
            let hasGears = false;
            for (let b = 0; b < beamCount; b++) if (boardState[b]) for (let h = 0; h < 11; h++) if (boardState[b][h]) hasGears = true;

            if (!hasGears) {
                updateStatus(t('noGearsToRotate'));
                return;
            }

            // Initialize Simulation State
            isRunning = true;
            document.getElementById('toggleRun').innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                Durdur
            `;

            lastFrameTime = performance.now();

            // Render Stats (Initial State)
            renderSimulationStats();

            // Start Loop
            animationFrameId = requestAnimationFrame(animate);
        }

        function stopSimulation() {
            isRunning = false;
            document.getElementById('toggleRun').innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Çalıştır
            `;
            cancelAnimationFrame(animationFrameId);

            // Hide stats panel NO MORE
            // document.getElementById('simulationStats').classList.remove('active');

            // Re-render to show static state (grey background, no dynamics)
            renderSimulationStats();
        }

        function renderSimulationStats() {
            const statsGrid = document.getElementById('statsGrid');
            const statsPanel = document.getElementById('simulationStats');

            // Collect all gears
            const allGears = [];
            let driverGear = null;
            let driverIndex = 0;

            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (boardState[beamIdx]) {
                    for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                        let gear = boardState[beamIdx][holeIdx];
                        if (gear) {
                            const baseVelocity = gear.velocity || 0;
                            const isMotorPosition = motorPosition &&
                                motorPosition.beamIndex === beamIdx &&
                                motorPosition.holeIndex === holeIdx;

                            let layerIdx = 0;
                            let current = gear;

                            while (current) {
                                // Sync velocity for stats
                                current.velocity = baseVelocity;

                                allGears.push({
                                    beamIndex: beamIdx,
                                    holeIndex: holeIdx,
                                    gear: current,
                                    isMotor: isMotorPosition,
                                    layer: layerIdx,
                                    visualId: `gear_visual_${beamIdx}_${holeIdx}_L${layerIdx}`
                                });

                                // Add Virtual Tooth Entries for Pointers
                                const pointers = current.pointers || (current.hasPointer ? [0] : []);
                                pointers.forEach((pOffset, pIdx) => {
                                    allGears.push({
                                        beamIndex: beamIdx,
                                        holeIndex: holeIdx,
                                        gear: {
                                            type: 'tooth',
                                            teeth: 1,
                                            color: '#FF7F00',
                                            angle: (current.angle || 0) + pOffset,
                                            velocity: current.velocity
                                        },
                                        isMotor: false,
                                        layer: layerIdx,
                                        isVirtual: true,
                                        pointerIndex: pIdx,
                                        visualId: `pointer_visual_${beamIdx}_${holeIdx}_L${layerIdx}_P${pIdx}`
                                    });
                                });

                                if (isMotorPosition && layerIdx === 0) {
                                    driverGear = current;
                                    driverIndex = allGears.length - 1 - pointers.length; // Adjust index to point to real gear
                                }

                                current = current.nextLayer;
                                layerIdx++;
                            }
                        }
                    }
                }
            }

            if (!driverGear && allGears.length > 0) {
                driverGear = allGears[0].gear;
                driverIndex = 0;
            }

            if (allGears.length === 0) {
                statsPanel.classList.remove('active');
                return;
            }
            statsPanel.classList.add('active');

            let html = '';
            // Show dynamics ONLY if running
            const showDynamics = isRunning;

            allGears.forEach((item, idx) => {
                const gear = item.gear;

                // Hide Bush from stats (but show Tooth)
                if (gear.type === 'bush') return;

                const isDriver = !item.isVirtual && (idx === driverIndex); // Fix driver check
                // Note: We need accurate index mapping. Let's simplify: driver is only the main gear.
                // Re-calculating driver logic is complex with inserted items.
                // Let's iterate and check reference.
                const isRealDriver = (gear === driverGear);
                const hasMotor = item.isMotor;

                // For virtual items, use parent velocity logic
                const isSpinning = showDynamics && (Math.abs(gear.velocity) > 0.001 || (isRealDriver && hasMotor));

                // Add active class for green background if spinning
                const activeClass = isSpinning ? 'active-spinning' : (isRealDriver ? 'driver' : '');

                let dynamicRows = '';
                if (isSpinning) {
                    const directionText = gear.velocity > 0 ? 'Saat Yönü' : 'Ters Yön';
                    const directionIcon = gear.velocity > 0 ? '↻' : '↺';
                    const dirClass = gear.velocity > 0 ? 'cw' : 'ccw';

                    let speedRatio = '1.00';
                    if (driverGear && Math.abs(driverGear.velocity) > 0.001) {
                        speedRatio = Math.abs(gear.velocity / driverGear.velocity).toFixed(2);
                    } else if (Math.abs(gear.velocity) < 0.001) {
                        speedRatio = '0.00';
                    }

                    dynamicRows = `
                        <div class="gear-stat-row">
                            <span class="gear-stat-label">Yön:</span>
                            <span class="gear-stat-value ${dirClass}">
                                <span class="rotation-indicator">${directionIcon}</span> ${directionText}
                            </span>
                        </div>
                        <div class="gear-stat-row">
                            <span class="gear-stat-label">Hız:</span>
                            <span class="gear-stat-value">
                                ${speedRatio}x 
                                <span style="font-size: 0.8em; color: #64748b; margin-left: 4px;">
                                    (${Math.round(Math.abs(gear.velocity) * 300)} RPM)
                                </span>
                            </span>
                        </div>
                     `;
                }

                html += `
                    <div class="gear-stat-card ${activeClass}" onclick="highlightGear('${item.visualId}')" style="cursor: pointer;">
                        <div class="gear-stat-header">
                            <div class="gear-stat-color" style="background: ${gear.color}"></div>
                            <span class="gear-stat-name">${gear.type === 'tooth' ? 'Tooth' : gear.teeth + 'T'}</span>
                            <span class="gear-stat-hole">(K${item.beamIndex + 1} D${item.holeIndex + 1}${item.layer > 0 ? ' L' + (item.layer + 1) : ''})</span>
                        </div>
                        <div class="gear-stat-values">
                            <div class="gear-stat-row">
                                <span class="gear-stat-label">Rol:</span>
                                <span class="gear-stat-value">${isDriver ? (hasMotor ? '⚡ Motor' : '🔧 Sürücü') : '⚙️ Takipçi'}</span>
                            </div>
                            ${dynamicRows}
                            <div class="gear-stat-row">
                                <span class="gear-stat-label">Açı:</span>
                                <span class="gear-stat-value" id="${item.isVirtual ? `angle_pointer_${item.beamIndex}_${item.holeIndex}_L${item.layer}_P${item.pointerIndex}` : `angle_${item.beamIndex}_${item.holeIndex}_L${item.layer}`}">${Math.round(gear.angle || 0)}°</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            statsGrid.innerHTML = html;
        }

        // Highlight Selected Gear with Yellow Glow
        let currentHighlight = null;
        let currentHighlightKey = null;

        function highlightGear(visualId) {
            const key = visualId;

            // Toggle: If same gear clicked again, remove highlight
            if (currentHighlightKey === key) {
                clearHighlight();
                return;
            }

            // Remove previous highlight
            clearHighlight();

            // Find the gear visual element
            const el = document.getElementById(visualId);
            if (el) {
                // Apply yellow glow effect
                el.style.transition = 'filter 0.3s ease';
                el.style.filter = 'drop-shadow(0 0 8px #facc15) drop-shadow(0 0 15px #fbbf24) drop-shadow(0 0 25px #f59e0b)';
                currentHighlight = el;
                currentHighlightKey = key;
            }
        }

        function clearHighlight() {
            if (currentHighlight) {
                currentHighlight.style.filter = '';
                currentHighlight.style.transition = '';
                currentHighlight = null;
                currentHighlightKey = null;
            }
        }

        function updateAngleDisplay() {
            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (boardState[beamIdx]) {
                    for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                        let gear = boardState[beamIdx][holeIdx];
                        let layerIdx = 0;
                        while (gear) {
                            const axleAngle = getAxleAngle(beamIdx, holeIdx);
                            const angleEl = document.getElementById(`angle_${beamIdx}_${holeIdx}_L${layerIdx}`);
                            if (angleEl) {
                                const normalizedAngle = ((axleAngle % 360) + 360) % 360;
                                angleEl.textContent = `${normalizedAngle.toFixed(0)}°`;
                            }

                            // Update Pointer Angles (Virtual Teeth)
                            const pointers = gear.pointers || (gear.hasPointer ? [0] : []);
                            pointers.forEach((pOffset, pIdx) => {
                                const pAngleEl = document.getElementById(`angle_pointer_${beamIdx}_${holeIdx}_L${layerIdx}_P${pIdx}`);
                                if (pAngleEl) {
                                    const pAngle = (axleAngle + pOffset);
                                    const normPAngle = ((pAngle % 360) + 360) % 360;
                                    pAngleEl.textContent = `${normPAngle.toFixed(0)}°`;
                                }
                            });

                            gear = gear.nextLayer;
                            layerIdx++;
                        }
                    }
                }
            }
        }

        let lastFrameTime = 0;
        function animate(time) {
            if (!isRunning) return;

            const delta = (time - lastFrameTime);
            const safeDelta = Math.min(delta, 50);
            lastFrameTime = time;

            const speedFactor = 0.1;
            const currentSpeedMultiplier = parseFloat(document.getElementById('speedSlider')?.value || 1);

            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (!boardState[beamIdx]) continue;

                for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                    const gearStack = boardState[beamIdx][holeIdx];
                    if (!gearStack) continue;

                    const axleVelocity = getAxleVelocity(beamIdx, holeIdx);
                    if (axleVelocity !== 0) {
                        const deltaAngle = axleVelocity * currentSpeedMultiplier * speedFactor * safeDelta;
                        setAxleAngle(beamIdx, holeIdx, getAxleAngle(beamIdx, holeIdx) + deltaAngle);
                    }

                    const axleAngle = getAxleAngle(beamIdx, holeIdx);
                    let current = gearStack;
                    let layerIdx = 0;

                    while (current) {
                        const visual = document.getElementById(`gear_visual_${beamIdx}_${holeIdx}_L${layerIdx}`);
                        if (visual) {
                            visual.style.transform = `translate(-50%, -50%) rotate(${axleAngle}deg)`;

                            const pointers = current.pointers || (current.hasPointer ? [0] : []);
                            pointers.forEach((pOffset, pIdx) => {
                                const pointerVisual = document.getElementById(
                                    `pointer_visual_${beamIdx}_${holeIdx}_L${layerIdx}_P${pIdx}`
                                );
                                if (pointerVisual) {
                                    pointerVisual.style.transform =
                                        `translate(-50%, -50%) rotate(${axleAngle + pOffset}deg)`;
                                }
                            });
                        }

                        current = current.nextLayer;
                        layerIdx++;
                    }
                }
            }

            updateAngleDisplay();
            animationFrameId = requestAnimationFrame(animate);
        }

        // Start
        // init(); moved to bottom
