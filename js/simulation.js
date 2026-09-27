// Gear interaction, physics, side view, reports, and animation.

// --- INTERACTION ---

        function handleHoleClick(beamIndex, holeIndex) {
            // Motor mode: place motor on this hole
            if (motorMode) {
                // Remove motor from previous position if any
                motorPosition = { beamIndex, holeIndex };
                motorMode = false;

                // Update UI
                const btn = document.getElementById('motorModeBtn');
                btn.classList.remove('active');
                btn.innerHTML = '⚡ Motor Yerleştir';

                renderBeam();
                updateMotorInfoPanel();
                updateStatus(`Motor Kiriş ${beamIndex + 1}, Delik ${holeIndex + 1}'e yerleştirildi.`);
                return;
            }

            // Delete mode: remove gear if exists
            if (deleteMode) {
                // Also remove motor if clicking on motor position
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
                        // Remove topmost layer
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

            // Tooth Mode
            if (toothMode) {
                // Add Pointer Overlay
                // Assuming addGear handles 'tooth' type logic to toggle pointer
                // Create a fake template with required properties for rendering
                const template = { type: 'tooth', teeth: 1, color: '#FF7F00', radius: 0.5 };
                addGear(beamIndex, holeIndex, template);
                return;
            }

            // Add Gear
            if (selectedGearIndex === null) {
                updateStatus(t('selectGearFirst'), true);
                return;
            }

            // Multi-Layer Support: If hole occupied, try adding to next layer
            if (boardState[beamIndex][holeIndex] !== null) {
                let current = boardState[beamIndex][holeIndex];
                let layerCount = 1;
                while (current.nextLayer) {
                    current = current.nextLayer;
                    layerCount++;
                }

                // Limit layers
                if (layerCount >= 2) {
                    updateStatus('Bu delik dolu (Maksimum 2 katman).');
                    return;
                }

                // Add to next layer with angle offset to avoid visual overlap
                const template = GEARS[selectedGearIndex];
                // Deep copy
                current.nextLayer = JSON.parse(JSON.stringify(template));
                // Offset angle by half tooth pitch (~22.5 degrees) from the layer below
                const offsetAngle = template.teeth > 0 ? (180 / template.teeth) : 22.5;
                current.nextLayer.angle = (current.angle + offsetAngle) % 360;

                renderBeam();
                updateStatus(t('layerAdded'));
            } else {
                addGear(beamIndex, holeIndex, GEARS[selectedGearIndex]);
            }
        }

        function addGear(beamIndex, holeIndex, gearTemplate) {
            // Check if adding a pointer (Tooth) overlay to an existing gear
            const existingGear = boardState[beamIndex][holeIndex];
            if (gearTemplate.type === 'tooth' && existingGear) {
                if (!existingGear.pointers) existingGear.pointers = [];
                // Prevent duplicate pointers at same angle
                if (!existingGear.pointers.includes(currentPointerAngle)) {
                    existingGear.pointers.push(currentPointerAngle);
                    renderBeam();
                }
                return;
            }

            // Auto-align angle with neighbors for meshing
            let initialAngle = 0;
            const halfPitch = 180 / gearTemplate.teeth;

            // Find any meshing neighbor by scanning all gears
            let foundNeighbor = null;

            for (let bIdx = 0; bIdx < beamCount; bIdx++) {
                for (let hIdx = 0; hIdx < 11; hIdx++) {
                    if (bIdx === beamIndex && hIdx === holeIndex) continue;
                    if (boardState[bIdx] && boardState[bIdx][hIdx]) {
                        const neighbor = boardState[bIdx][hIdx];
                        const beamDiff = Math.abs(bIdx - beamIndex);
                        const holeDiff = Math.abs(hIdx - holeIndex);
                        const dist = Math.sqrt(beamDiff * beamDiff + holeDiff * holeDiff);
                        const radiiSum = gearTemplate.radius + neighbor.radius;
                        const tolerance = radiiSum * 0.20; // 20% tolerance

                        if (Math.abs(dist - radiiSum) <= tolerance) {
                            foundNeighbor = neighbor;
                            break;
                        }
                    }
                }
                if (foundNeighbor) break;
            }

            if (foundNeighbor) {
                const neighborHalfPitch = 180 / foundNeighbor.teeth;
                // Offset by neighbor's half pitch for proper meshing (tooth into gap)
                initialAngle = foundNeighbor.angle + neighborHalfPitch;
            }

            // Normalize angle
            initialAngle = ((initialAngle % 360) + 360) % 360;

            // New gear instance (Ensure pointers array is copied, not referenced)
            boardState[beamIndex][holeIndex] = {
                ...gearTemplate,
                pointers: gearTemplate.pointers ? [...gearTemplate.pointers] : undefined,
                angle: initialAngle,
                velocity: 0,
                beamIndex: beamIndex,
                holeIndex: holeIndex
            };
            renderBeam();
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

        function validateAndCalculate() {
            const connections = [];
            gearConnectionsMap = {}; // Reset global map for manual rotation
            let isValid = true;
            let statusMsg = t('gearsPlaced');

            // Collect all gears with their positions (Multi-Layer)
            const allGears = [];
            for (let beamIdx = 0; beamIdx < beamCount; beamIdx++) {
                if (boardState[beamIdx]) {
                    for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                        let g = boardState[beamIdx][holeIdx];
                        // Check if this hole has the motor
                        const isMotorPos = motorPosition &&
                            motorPosition.beamIndex === beamIdx &&
                            motorPosition.holeIndex === holeIdx;

                        let layer = 0;
                        while (g) {
                            allGears.push({
                                beamIndex: beamIdx,
                                holeIndex: holeIdx,
                                gear: g,
                                layer: layer,
                                isMotor: isMotorPos
                            });
                            g = g.nextLayer;
                            layer++;
                        }
                    }
                }
            }

            // Check connections check (Dynamic Distance)
            for (let i = 0; i < allGears.length; i++) {
                for (let j = i + 1; j < allGears.length; j++) {
                    const gearA = allGears[i];
                    const gearB = allGears[j];

                    if (gearA.layer !== gearB.layer) continue;

                    // Support Vertical & Horizontal & Diagonal Connections
                    // Calculate Euclidean Distance in Studs
                    // LEGO Technic: h=1.19 creates near perfect vertical stack for 4-beam gap (36+40)
                    const BEAM_VERTICAL_SPACING = 1.19; // Studs between beam hole centers vertically
                    const beamDist = Math.abs(gearA.beamIndex - gearB.beamIndex) * BEAM_VERTICAL_SPACING;
                    const holeDist = Math.abs(gearA.holeIndex - gearB.holeIndex);
                    const actualDist = Math.sqrt(beamDist * beamDist + holeDist * holeDist);

                    const requiredDist = gearA.gear.radius + gearB.gear.radius;

                    // Bush Logic: No Mesh, Only Collision
                    if (gearA.gear.type === 'bush' || gearB.gear.type === 'bush') {
                        if (requiredDist > actualDist + 0.15) {
                            connections.push({
                                fromBeam: gearA.beamIndex, from: gearA.holeIndex,
                                toBeam: gearB.beamIndex, to: gearB.holeIndex,
                                type: 'collision', layer: gearA.layer
                            });
                            isValid = false;
                            statusMsg = t('collision', gearA.beamIndex + 1, gearB.beamIndex + 1);
                        }
                        continue;
                    }

                    // Gear Logic: Mesh or Collision
                    // Valid mesh tolerance: 0.22 (robust tolerance for all diagonal approximations)
                    const MESH_TOLERANCE = 0.22;
                    if (Math.abs(actualDist - requiredDist) < MESH_TOLERANCE) {
                        connections.push({
                            fromBeam: gearA.beamIndex, from: gearA.holeIndex,
                            toBeam: gearB.beamIndex, to: gearB.holeIndex,
                            type: 'valid', layer: gearA.layer
                        });

                        // Populate Global Map for Manual Rotation (Drag)
                        const keyA = `${gearA.beamIndex}_${gearA.holeIndex}`;
                        const keyB = `${gearB.beamIndex}_${gearB.holeIndex}`;
                        if (!gearConnectionsMap[keyA]) gearConnectionsMap[keyA] = [];
                        if (!gearConnectionsMap[keyB]) gearConnectionsMap[keyB] = [];
                        const ratio = -(gearA.gear.teeth / gearB.gear.teeth);
                        if (!gearConnectionsMap[keyA].find(x => x.k === keyB)) gearConnectionsMap[keyA].push({ k: keyB, b: gearB.beamIndex, h: gearB.holeIndex, ratio: ratio });
                        if (!gearConnectionsMap[keyB].find(x => x.k === keyA)) gearConnectionsMap[keyB].push({ k: keyA, b: gearA.beamIndex, h: gearA.holeIndex, ratio: 1 / ratio });

                    } else if (requiredDist > actualDist + MESH_TOLERANCE) {
                        // Only report collision if they OVERLAP significantly
                        connections.push({
                            fromBeam: gearA.beamIndex, from: gearA.holeIndex,
                            toBeam: gearB.beamIndex, to: gearB.holeIndex,
                            type: 'collision', layer: gearA.layer
                        });
                        isValid = false;
                        statusMsg = `⚠️ Çarpışma: (K${gearA.beamIndex + 1}-K${gearB.beamIndex + 1})`;
                    }
                }
            }

            // Speed Propagation (graph based)
            // 1. Reset
            for (let b = 0; b < beamCount; b++) {
                if (boardState[b]) for (let h = 0; h < 11; h++) {
                    let g = boardState[b][h];
                    while (g) { g.velocity = 0; g = g.nextLayer; }
                }
            }

            // 2. BFS from Motors
            let queue = [];
            allGears.forEach(item => {
                if (item.isMotor) {
                    item.gear.velocity = 1;
                    queue.push(item);
                }
            });

            let visited = new Set();
            queue.forEach(q => visited.add(`${q.beamIndex}-${q.holeIndex}-${q.layer}`));

            let head = 0;
            while (head < queue.length) {
                const current = queue[head++];
                const cv = current.gear.velocity;

                // A. Co-axial (Axle Lock)
                const stackHead = boardState[current.beamIndex][current.holeIndex];
                let s = stackHead;
                let l = 0;
                while (s) {
                    const key = `${current.beamIndex}-${current.holeIndex}-${l}`;
                    if (!visited.has(key)) {
                        s.velocity = cv;
                        visited.add(key);
                        queue.push({ beamIndex: current.beamIndex, holeIndex: current.holeIndex, gear: s, layer: l });
                    }
                    s = s.nextLayer;
                    l++;
                }

                // B. Mesh Connections
                connections.forEach(conn => {
                    if (conn.type !== 'valid' || conn.layer !== current.layer) return;

                    let neighborKey = '';
                    let targetBeam = -1, targetHole = -1;

                    if (conn.fromBeam === current.beamIndex && conn.from === current.holeIndex) {
                        targetBeam = conn.toBeam; targetHole = conn.to;
                    } else if (conn.toBeam === current.beamIndex && conn.to === current.holeIndex) {
                        targetBeam = conn.fromBeam; targetHole = conn.from;
                    }

                    if (targetBeam !== -1) {
                        // Find gear object
                        let tStack = boardState[targetBeam][targetHole];
                        let tGear = null;
                        let i = 0;
                        while (tStack) { if (i === current.layer) { tGear = tStack; break; } tStack = tStack.nextLayer; i++; }

                        if (tGear) {
                            neighborKey = `${targetBeam}-${targetHole}-${current.layer}`;
                            if (!visited.has(neighborKey)) {
                                const r1 = current.gear.radius;
                                const r2 = tGear.radius;
                                tGear.velocity = cv * -(r1 / r2);
                                visited.add(neighborKey);
                                queue.push({ beamIndex: targetBeam, holeIndex: targetHole, gear: tGear, layer: current.layer });
                            }
                        }
                    }
                });
            }

            renderConnections(connections);

            const hasGears = allGears.length > 0;
            if (!hasGears) {
                updateStatus("Simülasyon hazır.", false);
            } else if (!isValid) {
                updateStatus(statusMsg, true);
            } else if (connections.length > 0) {
                updateStatus(`✅ Bağlantı aktif. Mesh hesabı yapıldı.`);
            } else {
                updateStatus(t('gearsIndependent'));
            }

            // Always update stats UI when board changes
            renderSimulationStats();
            renderSideView();

            return { isValid, connections };
        }

        function renderSideView_Old() {
            const container = document.getElementById('sideViewContainer');
            if (!container) return;

            // Visual Constants for Side Profile
            const scale = 0.55; // Scale down to fit box
            const studSize = STUD_SPACING * scale; // Horizontal space per hole
            const beamHeight = 20; // Visual thickness of beam (Top Layer)
            const gearHeight = 18; // Visual thickness of gear (Bottom Layer)
            const axleHeight = 15; // Connection length
            const layerGap = 8;

            // Calculate SVG height based on beam count
            // Each beam takes: beamHeight + axleHeight + gearHeight + margin
            const rowHeight = 70;
            const svgWidth = (11 * studSize) + 40;
            const svgHeight = Math.max(80, beamCount * rowHeight);

            let svgContent = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="overflow:visible;">`;

            // Draw each beam row
            for (let b = 0; b < beamCount; b++) {
                const startY = b * rowHeight + 10;
                const beamY = startY;
                const gearY = startY + beamHeight + layerGap;

                // 1. Draw Brick Layer (The Beam)
                // Looks like a long rectangle
                const beamWidth = 11 * studSize;
                // Beam Color Mapping
                const colorMap = {
                    'blue': '#0056b3', 'red': '#c91a09', 'yellow': '#f59e0b',
                    'green': '#16a34a', 'white': '#e2e8f0', 'black': '#1e293b'
                };
                const bColor = colorMap[beamColor] || '#0056b3';

                // Draw Beam Body
                svgContent += `
                    <!-- Beam ${b + 1} -->
                    <rect x="20" y="${beamY}" width="${beamWidth}" height="${beamHeight}" rx="2" fill="${bColor}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
                    <!-- Stud tops indication (small lines) -->
                `;

                // Add stud markers on beam
                for (let s = 0; s < 11; s++) {
                    svgContent += `<circle cx="${20 + s * studSize + studSize / 2}" cy="${beamY + beamHeight / 2}" r="2" fill="rgba(0,0,0,0.2)" />`;
                }

                // 2. Scan for Gears to draw Gear Layer
                if (boardState[b]) {
                    for (let h = 0; h < 11; h++) {
                        const gear = boardState[b][h];
                        if (gear) {
                            const centerX = 20 + (h * studSize) + (studSize / 2);

                            // Gear Width (Diameter edge-on)
                            const diameter = (gear.radius * 2 * STUD_SPACING * scale);

                            // Draw Axle (Yellow) connecting Beam and Gear
                            svgContent += `
                                <rect x="${centerX - 3}" y="${beamY + beamHeight / 2}" width="6" height="${beamHeight / 2 + layerGap + gearHeight}" fill="#facc15" stroke="#ca8a04" stroke-width="0.5" rx="1"/>
                            `;

                            // Draw Gear (Edge View) - A rectangle with "teeth" pattern
                            // If user wants specific look for 28T vs others, we can differentiate, but usually generic 'ridged cylinder' looks fine.
                            const gColor = gear.color;
                            const dColor = adjustColor(gColor, -20);

                            // Main Gear Body
                            svgContent += `
                                <rect x="${centerX - diameter / 2}" y="${gearY}" width="${diameter}" height="${gearHeight}" rx="3" fill="${gColor}" stroke="${dColor}" stroke-width="1"/>
                            `;

                            // Add rudimentary "teeth" texture (vertical lines)
                            const toothSpacing = 4;
                            const numStripes = Math.floor(diameter / toothSpacing);
                            for (let t = 1; t < numStripes; t++) {
                                svgContent += `
                                    <line x1="${centerX - diameter / 2 + t * toothSpacing}" y1="${gearY}" 
                                          x2="${centerX - diameter / 2 + t * toothSpacing}" y2="${gearY + gearHeight}" 
                                          stroke="${dColor}" stroke-width="0.5" opacity="0.5"/>
                                `;
                            }
                        }
                    }
                }
            }

            svgContent += `</svg>`;
            container.innerHTML = svgContent;
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

            // Visual Constants for Side Profile
            const scale = 0.5;
            const studSize = STUD_SPACING * scale;
            const beamHeight = 20;
            const gearHeight = 18;
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
                            const gearRadiusPx = current.radius * STUD_SPACING * scale;
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
                            const diameter = (current.radius * 2 * STUD_SPACING * scale);
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
            const layer = document.getElementById('connectionLayer');
            if (!layer) return;

            layer.innerHTML = connections.map(conn => {
                const isError = conn.type === 'collision';

                // Calculate position relative to hole container origin (left: 20px)
                // Hole center X = index * STUD_SPACING
                // Start X = from * STUD_SPACING
                // Width = (to - from) * STUD_SPACING

                // We want the line to start from center of From hole to center of To hole.
                // The layer is inside .technic-beam which has padding. 
                // But .beam-holes is rel pos.
                // Let's attach relative to connectionLayer which is at top-left of beam content

                // Adjust for parent padding (20px)
                const startX = (conn.from * STUD_SPACING) + 20 + 12; // 20 padding + 12 half hole
                const width = (conn.to - conn.from) * STUD_SPACING;

                return `
                    <div class="connection-indicator ${isError ? 'error' : ''}" 
                         style="left: ${startX}px; width: ${width}px; background-color: ${isError ? '#e74c3c' : '#2ecc71'};">
                    </div>
                `;
            }).join('');
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
                            // Update Gear Angle
                            const angleEl = document.getElementById(`angle_${beamIdx}_${holeIdx}_L${layerIdx}`);
                            if (angleEl) {
                                const normalizedAngle = ((gear.angle % 360) + 360) % 360;
                                angleEl.textContent = `${normalizedAngle.toFixed(0)}°`;
                            }

                            // Update Pointer Angles (Virtual Teeth)
                            const pointers = gear.pointers || (gear.hasPointer ? [0] : []);
                            pointers.forEach((pOffset, pIdx) => {
                                const pAngleEl = document.getElementById(`angle_pointer_${beamIdx}_${holeIdx}_L${layerIdx}_P${pIdx}`);
                                if (pAngleEl) {
                                    const pAngle = (gear.angle + pOffset);
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
                if (boardState[beamIdx]) {
                    for (let holeIdx = 0; holeIdx < 11; holeIdx++) {
                        const gearStack = boardState[beamIdx][holeIdx];

                        if (gearStack) {
                            // Physics Update (Base Layer drives the stack)
                            if (gearStack.velocity !== 0) {
                                const da = gearStack.velocity * currentSpeedMultiplier * speedFactor * safeDelta;
                                gearStack.angle += da;
                            }

                            // Render Update (All Layers Synced)
                            let current = gearStack;
                            let layerIdx = 0;
                            const baseAngle = gearStack.angle;

                            while (current) {
                                // Sync angle for co-axial gears
                                current.angle = baseAngle;

                                // Update Visual Element
                                const visual = document.getElementById(`gear_visual_${beamIdx}_${holeIdx}_L${layerIdx}`);
                                if (visual) {
                                    visual.style.transform = `translate(-50%, -50%) rotate(${current.angle}deg)`;

                                    // Update Pointers if any
                                    const pointers = current.pointers || (current.hasPointer ? [0] : []);
                                    pointers.forEach((pOffset, pIdx) => {
                                        const pVisual = document.getElementById(`pointer_visual_${beamIdx}_${holeIdx}_L${layerIdx}_P${pIdx}`);
                                        if (pVisual) {
                                            pVisual.style.transform = `translate(-50%, -50%) rotate(${current.angle + pOffset}deg)`;
                                        }
                                    });
                                }

                                current = current.nextLayer;
                                layerIdx++;
                            }
                        }
                    }
                }
            }

            updateAngleDisplay();
            animationFrameId = requestAnimationFrame(animate);
        }

        // Start
        // init(); moved to bottom
