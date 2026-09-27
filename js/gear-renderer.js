// Palette, beam, and dynamic LEGO gear SVG rendering.

// --- RENDERING ---

        function renderPalette() {
            const container = document.getElementById('gearPalette');
            container.innerHTML = GEARS.map((gear, index) => {
                const label = gear.teeth > 0 ? `${gear.teeth} ${t('teeth')}` : t('bore');
                const alt = gear.teeth > 0
                    ? `LEGO Technic ${gear.teeth} tooth gear, part ${gear.partNum}`
                    : `LEGO Technic bush, part ${gear.partNum}`;

                return `
                <div class="gear-option" onclick="selectGear(${index})" id="gearOption_${index}">
                    <div class="gear-image-wrapper">
                        <img
                            class="gear-part-image"
                            src="${rebrickableElementImage(gear.elementId)}"
                            alt="${alt}"
                            loading="lazy"
                            decoding="async"
                            onerror="handlePaletteImageError(this, ${index})">
                    </div>
                    <span>${label}</span>
                </div>
            `}).join('');
        }

        function handlePaletteImageError(img, index) {
            const gear = GEARS[index];
            const wrapper = img && img.parentElement;
            if (!gear || !wrapper) return;

            // Rebrickable is an external dependency. Keep the app usable if an image is unavailable.
            wrapper.innerHTML = generateGearIconSVG(gear.teeth, gear.color, gear.radius);
        }

        function selectGear(index) {
            // Disable delete mode when selecting a gear
            if (deleteMode) {
                deleteMode = false;
                document.getElementById('deleteModeBtn').classList.remove('active');
                const trashIcon = iconSvg('trash', 'ui-icon ui-icon--sm');
                document.getElementById('deleteModeBtn').innerHTML = trashIcon + t('deleteGear');
                document.getElementById('simContainer').classList.remove('delete-mode');
            }

            selectedGearIndex = index;
            document.querySelectorAll('.gear-option').forEach(el => el.classList.remove('selected'));

            const option = document.getElementById(`gearOption_${index}`);
            if (option) option.classList.add('selected');

            // Bush button code removed

            // Toggle Tooth Settings Panel
            const toothPanel = document.getElementById('toothSettingsPanel');
            if (toothPanel) {
                toothPanel.style.display = (GEARS[index].type === 'tooth') ? 'block' : 'none';
            }

            if (GEARS[index].type === 'bush') {
                updateStatus(t('selectBore'));
            } else {
                updateStatus(t('selectGear', GEARS[index].teeth));
            }
        }

        // Global State for Beam Tab
        let activeBeamIndex = 0;

        function renderBeam() {
            const container = document.getElementById('simContainer');
            const holeSize = LEGO_GEOMETRY.HOLE_SIZE_PX;
            const holeRadius = LEGO_GEOMETRY.HOLE_RADIUS_PX;
            const gearLayerLeft = GEAR_LAYER_LEFT_PX;
            const axleCenterY = LEGO_GEOMETRY.AXLE_CENTER_Y_PX;
// Color Map Logic
            const colorMap = {
                'blue': '#0055BF',
                'red': '#C91A09',
                'yellow': '#F2CD37',
                'green': '#237841',
                'white': '#FFFFFF',
                'black': '#1e293b'
            };
            const bgColor = colorMap[beamColor] || '#0055BF';

            // Determine border style based on color
            let borderStyle = '1px solid rgba(0,0,0,0.1)';
            if (beamColor === 'blue') borderStyle = '1px solid #004494';
            if (beamColor === 'white') borderStyle = '1px solid #cbd5e1';
            if (beamColor === 'black') borderStyle = '1px solid #0f172a';

            let html = '';

            // Remove Tabs Bar

            // Render Beam Content
            html += '<div class="beam-content-area" style="padding-top: 5px;">';

            for (let beamIndex = 0; beamIndex < beamCount; beamIndex++) {
                // Render ALL beams (List View)

                // Generate studs HTML (Enable for active beam or all? Top beam usually has studs)
                // In classic list view, usually top beam had studs.
                // Let's stick to step 1682 logic: if (beamIndex === 0) studs.
                // Or maybe all beams have studs visually?
                // User said "eskisi gibi". Eskiden sadece en üstte vardı (Step 1682 Line 1218).

                let studsHtml = '';
                if (beamIndex === 0) {
                    for (let i = 0; i < 12; i++) {
                        studsHtml += `<div class="stud" style="background: ${bgColor} !important; border-color: rgba(0,0,0,0.2);"></div>`;
                    }
                }

                // Build holes HTML for this beam
                let holesHtml = '';
                let gearsHtml = '';
                let removeBtnsHtml = '';

                // Get this beam's gears
                const beamGears = boardState[beamIndex] || [];

                // 11 Holes for Technic Brick
                for (let holeIndex = 0; holeIndex < 11; holeIndex++) {
                    const gear = beamGears[holeIndex];

                    // Check if this hole has a motor
                    const hasMotor = motorPosition &&
                        motorPosition.beamIndex === beamIndex &&
                        motorPosition.holeIndex === holeIndex;

                    // Render Hole
                    const hasGearClass = gear ? 'has-gear' : '';
                    const hasMotorClass = hasMotor ? 'has-motor' : '';
                    holesHtml += `
                        <div class="beam-hole ${hasGearClass} ${hasMotorClass}" 
                             onclick="handleHoleClick(${beamIndex}, ${holeIndex})" 
                             data-index="${holeIndex + 1}"
                             data-beam-index="${beamIndex}"
                             data-hole-index="${holeIndex}"
                             style="margin-right: ${holeIndex < 10 ? (STUD_SPACING - holeSize) + 'px' : '0'};">
                        </div>
                    `;

                    // Render Gear Stack (Multi-Layer)
                    if (gear) {
                        let current = gear;
                        let layerIdx = 0;
                        while (current) {
                            const pixelDiameter = getPhysicalRadius(current) * 2 * STUD_SPACING;
                            const centerX = holeIndex * STUD_SPACING;
                            const axleAngle = getAxleAngle(beamIndex, holeIndex);

                            gearsHtml += `
                                <div class="gear-on-beam" id="gear_visual_${beamIndex}_${holeIndex}_L${layerIdx}" 
                                    onmousedown="startGearDrag(event, ${beamIndex}, ${holeIndex})"
                                    onclick="handleHoleClick(${beamIndex}, ${holeIndex})"
                                    style="width:${pixelDiameter}px; height:${pixelDiameter}px; 
                                           left: ${centerX + holeRadius}px;
                                           z-index: ${10 + layerIdx};
                                           pointer-events: auto;
                                           transform: translate(-50%, -50%) rotate(${axleAngle}deg);">
                                    ${(current.type === 'bush') ? generateBushSVG(current.color, pixelDiameter, hasMotor) : generateDetailedGearSVG(current.teeth, current.color, pixelDiameter, hasMotor)}
                                </div>
                            `;

                            // Pointer Overlays (Tooth) - Support Multiple
                            const pointers = current.pointers || (current.hasPointer ? [0] : []);
                            pointers.forEach((pOffset, pIdx) => {
                                const ptrSize = STUD_SPACING * 2;
                                gearsHtml += `
                                    <div class="gear-on-beam pointer-overlay" 
                                        id="pointer_visual_${beamIndex}_${holeIndex}_L${layerIdx}_P${pIdx}"
                                        style="width:${ptrSize}px; height:${ptrSize}px; 
                                               left: ${centerX + holeRadius}px;
                                               z-index: ${20 + layerIdx};
                                               pointer-events: none;
                                               transform: translate(-50%, -50%) rotate(${axleAngle + pOffset}deg);">
                                        ${generateVisualPointerSVG('#FF7F00', ptrSize, false)}
                                    </div>
                                `;
                            });
                            current = current.nextLayer;
                            layerIdx++;
                        }

                        const centerX = holeIndex * STUD_SPACING;
                        removeBtnsHtml += `
                            <button class="gear-remove-btn" 
                                    onclick="removeGear(${beamIndex}, ${holeIndex})"
                                    style="left: ${centerX + holeRadius}px; top: -${holeRadius}px; transform: translateX(-50%); z-index: 30;">
                                ×
                            </button>
                        `;
                    }
                }

                // Append Beam HTML (No wrapper display:none needed, we loop only active)
                html += `
                    <div class="beam-wrapper">
                        <div class="beam-studs" style="left: 10px !important;">${studsHtml}</div>
                        <div class="technic-beam" style="margin-top: 0; background-color: ${bgColor} !important; border: ${borderStyle} !important;">
                            <div class="connection-layer" id="connectionLayer_${beamIndex}"></div>
                            <!-- Holes in normal flow (relative) -->
                            <div class="beam-holes" style="position:relative; z-index:2; margin-left: ${LEGO_GEOMETRY.HOLE_ROW_MARGIN_LEFT_PX}px;">
                                ${holesHtml}
                            </div>

                            <!-- Gears positioned at hole center -->
                            <div style="position: absolute; top: ${axleCenterY}px; left: ${gearLayerLeft}px; width: 100%; height: 0; z-index: 10;">
                                ${gearsHtml}
                            </div>
                            <!-- Hit area for removing gears -->
                            <div style="position: absolute; top: 0; left: ${gearLayerLeft}px; width: 100%; height: 100%; z-index: 100; pointer-events:none;">
                                ${removeBtnsHtml}
                            </div>
                        </div>
                    </div>
                `;
            }
            html += '</div>'; // End content area

            container.innerHTML = html;
            // Re-draw connections
            validateAndCalculate();
        }

        // Generic Icon SVG (Simplified)
        function generateGearIconSVG(teeth, color, radius = 1) {
            // Fixed container size
            const containerSize = 50;
            const maxRadius = 2.5; // 40T
            // Calculate scale factor: Min 0.5 (for smallest), Max 1.0 (for largest)
            // 8T (0.5r) -> 0.6
            // 40T (2.5r) -> 1.0
            const scale = 0.5 + (radius / maxRadius) * 0.5;

            // We render the SVG at full 50px size, but scale it down visually
            return `<div class="gear-icon-wrapper" style="width:${containerSize}px; height:${containerSize}px; display:flex; align-items:center; justify-content:center;">
                <div style="width:${containerSize}px; height:${containerSize}px; transform: scale(${scale}); transform-origin: center; display:flex; align-items:center; justify-content:center;">
                    ${generateDetailedGearSVG(teeth, color, containerSize, false)}
                </div>
            </div>`;
        }

        // Helper to generate consistent axle size regardless of gear scale
        function generateDynamicAxlePath(gearPixelSize, isMotor) {
            const targetSize = 28; // Target pixel size (approx 30px pin hole)
            const unitTotal = (targetSize * 100) / gearPixelSize; // Convert to SVG units (0-100)
            const half = unitTotal / 2;
            const thick = unitTotal * 0.38; // Thickness ratio
            const halfThick = thick / 2;

            const c = 50;
            const x1 = c - half;
            const y1 = c - halfThick;
            const x2 = c - halfThick;
            const y2 = c - half;

            return `<path d="M${x1} ${y1} h${unitTotal} v${thick} h-${unitTotal} z M${x2} ${y2} h${thick} v${unitTotal} h-${thick} z" fill="${isMotor ? '#FFD700' : '#EF4444'}"/>`;
        }

        // Bush SVG
        function generateBushSVG(color, size, isMotor) {
            const darker = adjustColor(color, -25);
            const lighter = adjustColor(color, 25);
            return `
             <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                  <!-- Main Body -->
                  <circle cx="50" cy="50" r="44" fill="${color}" stroke="${darker}" stroke-width="1.5"/>
                  
                  <!-- Inner depressed area -->
                  <circle cx="50" cy="50" r="28" fill="${lighter}" stroke="${darker}" stroke-width="1"/>
                  
                  <!-- 4 Tabs simulating the cross hole structure -->
                  <path d="M50 22 v14 M50 78 v-14 M22 50 h14 M78 50 h-14" stroke="${darker}" stroke-width="6" stroke-linecap="round"/>
                  
                  ${generateDynamicAxlePath(size, isMotor)}
             </svg>`;
        }

        // Visual Pointer (Tooth) SVG - Updated
        function generateVisualPointerSVG(color, size, isMotor) {
            const darker = adjustColor(color, -25);
            return `
             <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                  <!-- Pointer Shape pointing UP (Long & Tapered) -->
                  <!-- Tip: 50, -65 (Matches approx 36T radius). Base: 50, 50. -->
                  <path d="M38 50 L 50 -65 L 62 50 Z" fill="${color}" stroke="${darker}" stroke-width="1.5" stroke-linejoin="round"/>
                  <!-- Hub Circle -->
                  <circle cx="50" cy="50" r="16" fill="${color}" stroke="${darker}" stroke-width="1.5"/>
                  ${generateDynamicAxlePath(size, isMotor)}
             </svg>`;
        }

        // Detailed Gear SVG for Simulation
        function generateDetailedGearSVG(teeth, color, size, isMotor = false) {
            if (teeth === 0) return generateBushSVG(color, size, isMotor);
            if (teeth === 1) return generateVisualPointerSVG(color, size, isMotor);
            // Special design for 40T gear (Grid/Hole pattern)
            if (teeth === 40) {
                return generate40TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 24T gear (Custom)
            if (teeth === 24) {
                return generate24TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 28T gear (Double Bevel - New)
            if (teeth === 28) {
                return generate28TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 36T gear (Black with complex inner structure)
            if (teeth === 36) {
                return generate36TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 20T gear (Double Bevel Style)
            if (teeth === 20) {
                return generate20TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 12T gear (Bevel Style - Blue)
            if (teeth === 12) {
                return generate12TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 16T gear (Gray with 4 holes)
            if (teeth === 16) {
                return generate16TGearSVG(teeth, color, size, isMotor);
            }
            // Special design for 8T gear (Type 2)
            if (teeth === 8) {
                return generate8TGearSVG(teeth, color, size, isMotor);
            }

            const cx = 50;
            const cy = 50;

            // Generate darker shade for depth
            const darkerColor = adjustColor(color, -30);
            const lighterColor = adjustColor(color, 30);

            // Motor axle color (yellow if motor, else dark gray)
            const axleColor = isMotor ? '#f59e0b' : '#333';
            const axleStroke = isMotor ? '#d97706' : '#222';

            return `
            <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                <!-- Main Body (solid fill) -->
                <circle cx="50" cy="50" r="43" fill="${color}" stroke="${darkerColor}" stroke-width="2"/>
                
                <!-- Teeth Ring -->
                <circle cx="50" cy="50" r="48" fill="none" stroke="${color}" stroke-width="9" stroke-dasharray="4 ${(2 * Math.PI * 48) / teeth - 4}" />
                <circle cx="50" cy="50" r="48" fill="none" stroke="${darkerColor}" stroke-width="1" stroke-dasharray="4 ${(2 * Math.PI * 48) / teeth - 4}" />
                
                <!-- Inner ring detail -->
                <circle cx="50" cy="50" r="30" fill="${lighterColor}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Axle (Plus Shape) -->
                <!-- Center Axle (Plus Shape) - Dynamic Size -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 12T Gear (Bevel Style - Blue)
        function generate12TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -30);
            const lighterColor = adjustColor(color, 20);

            // Path Data for 12T with pointed teeth
            let pathD = "";
            const numTeeth = 12;
            const cx = 50, cy = 50;
            const rBase = 36;
            const rTip = 52;  // Slightly longer teeth
            const rad = Math.PI / 180;
            const toothBaseSpan = 20; // Degrees - wider base
            const toothTipSpan = 10;  // Wider tip for trapezoid shape

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;
                const aTipCenter = angle;

                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                // Trapezoid tooth (flat top, not pointed)
                const xTipR = cx + rTip * Math.cos((angle - toothTipSpan / 2) * rad);
                const yTipR = cy + rTip * Math.sin((angle - toothTipSpan / 2) * rad);
                const xTipL = cx + rTip * Math.cos((angle + toothTipSpan / 2) * rad);
                const yTipL = cy + rTip * Math.sin((angle + toothTipSpan / 2) * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                // Draw trapezoidal tooth
                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const xBaseRFirst = cx + rBase * Math.cos((-toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((-toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            return `
            <svg width="100%" height="100%" viewBox="-10 -10 120 120" style="overflow:visible">
                <!-- Main Gear Body with Pointed Teeth -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1.5" stroke-linejoin="round"/>
                
                <!-- Inner Ring for depth -->
                <circle cx="50" cy="50" r="24" fill="${lighterColor}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="14" fill="${color}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Axle (Plus Shape) - Dynamic Size -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 16T Gear (Gray with 4 holes)
        function generate16TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -30);
            const lighterColor = adjustColor(color, 15);

            // Path Data for 16T with trapezoid teeth
            let pathD = "";
            const numTeeth = 16;
            const cx = 50, cy = 50;
            const rBase = 40;  // Larger body radius
            const rTip = 54;   // Slightly larger tip
            const rad = Math.PI / 180;
            const toothBaseSpan = 14; // Degrees
            const toothTipSpan = 7;   // Narrower tip for trapezoid

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;

                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos((angle - toothTipSpan / 2) * rad);
                const yTipR = cy + rTip * Math.sin((angle - toothTipSpan / 2) * rad);
                const xTipL = cx + rTip * Math.cos((angle + toothTipSpan / 2) * rad);
                const yTipL = cy + rTip * Math.sin((angle + toothTipSpan / 2) * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                // Trapezoid tooth
                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const xBaseRFirst = cx + rBase * Math.cos((-toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((-toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            // Hole positions (4 holes at 45, 135, 225, 315 degrees)
            const holeRadius = 7;
            const holeDistance = 22;
            const holeAngles = [45, 135, 225, 315];
            const holePositions = holeAngles.map(a => ({
                x: cx + holeDistance * Math.cos(a * rad),
                y: cy + holeDistance * Math.sin(a * rad)
            }));

            const maskId = "mask_16t_holes";

            return `
            <svg width="100%" height="100%" viewBox="-10 -10 120 120" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="-10" y="-10" width="120" height="120" fill="white"/>
                        <!-- 4 Holes -->
                        <circle cx="${holePositions[0].x}" cy="${holePositions[0].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[1].x}" cy="${holePositions[1].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[2].x}" cy="${holePositions[2].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[3].x}" cy="${holePositions[3].y}" r="${holeRadius}" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Main Gear Body with Teeth (Masked for holes) -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1.5" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Ring (also masked) -->
                <circle cx="50" cy="50" r="26" fill="none" stroke="${darkerColor}" stroke-width="4" opacity="0.4" mask="url(#${maskId})"/>
                
                <!-- Hole Borders -->
                <circle cx="${holePositions[0].x}" cy="${holePositions[0].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[1].x}" cy="${holePositions[1].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[2].x}" cy="${holePositions[2].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[3].x}" cy="${holePositions[3].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="14" fill="${lighterColor}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Axle (Plus Shape) - Dynamic Size -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 36T Gear (Black with 4 holes)
        function generate36TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -20);
            const lighterColor = adjustColor(color, 30);

            // Path Data for 36T with trapezoid teeth
            let pathD = "";
            const numTeeth = 36;
            const cx = 50, cy = 50;
            const rBase = 46;  // Larger body
            const rTip = 56;   // Longer teeth for meshing with 12T
            const rad = Math.PI / 180;
            const toothBaseSpan = 6;  // Degrees
            const toothTipSpan = 3;   // Narrower tip

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;

                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos((angle - toothTipSpan / 2) * rad);
                const yTipR = cy + rTip * Math.sin((angle - toothTipSpan / 2) * rad);
                const xTipL = cx + rTip * Math.cos((angle + toothTipSpan / 2) * rad);
                const yTipL = cy + rTip * Math.sin((angle + toothTipSpan / 2) * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const xBaseRFirst = cx + rBase * Math.cos((-toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((-toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            // Hole positions: 2 round (45°, 225°) and 2 plus-shaped (135°, 315°)
            const holeRadius = 9;
            const holeDistance = 30;

            // Round holes at 45° and 225° (left and right)
            const roundHole1 = { x: cx + holeDistance * Math.cos(45 * rad), y: cy + holeDistance * Math.sin(45 * rad) };
            const roundHole2 = { x: cx + holeDistance * Math.cos(225 * rad), y: cy + holeDistance * Math.sin(225 * rad) };

            // Plus holes at 135° and 315° (top and bottom)
            const plusHole1 = { x: cx + holeDistance * Math.cos(135 * rad), y: cy + holeDistance * Math.sin(135 * rad) };
            const plusHole2 = { x: cx + holeDistance * Math.cos(315 * rad), y: cy + holeDistance * Math.sin(315 * rad) };

            const maskId = "mask_36t_holes";
            const plusW = 12, plusH = 4; // Plus shape dimensions

            return `
            <svg width="100%" height="100%" viewBox="-10 -10 120 120" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="-10" y="-10" width="120" height="120" fill="white"/>
                        <!-- 2 Round Holes -->
                        <circle cx="${roundHole1.x}" cy="${roundHole1.y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${roundHole2.x}" cy="${roundHole2.y}" r="${holeRadius}" fill="black"/>
                        <!-- 2 Plus-shaped Holes -->
                        <rect x="${plusHole1.x - plusW / 2}" y="${plusHole1.y - plusH / 2}" width="${plusW}" height="${plusH}" fill="black"/>
                        <rect x="${plusHole1.x - plusH / 2}" y="${plusHole1.y - plusW / 2}" width="${plusH}" height="${plusW}" fill="black"/>
                        <rect x="${plusHole2.x - plusW / 2}" y="${plusHole2.y - plusH / 2}" width="${plusW}" height="${plusH}" fill="black"/>
                        <rect x="${plusHole2.x - plusH / 2}" y="${plusHole2.y - plusW / 2}" width="${plusH}" height="${plusW}" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Main Gear Body with Teeth (Masked) -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Ring (masked) -->
                <circle cx="50" cy="50" r="38" fill="none" stroke="${lighterColor}" stroke-width="3" opacity="0.4" mask="url(#${maskId})"/>
                
                <!-- Round Hole Borders -->
                <circle cx="${roundHole1.x}" cy="${roundHole1.y}" r="${holeRadius}" fill="none" stroke="${lighterColor}" stroke-width="1"/>
                <circle cx="${roundHole2.x}" cy="${roundHole2.y}" r="${holeRadius}" fill="none" stroke="${lighterColor}" stroke-width="1"/>
                
                <!-- Plus Hole Borders -->
                <rect x="${plusHole1.x - plusW / 2}" y="${plusHole1.y - plusH / 2}" width="${plusW}" height="${plusH}" fill="none" stroke="${lighterColor}" stroke-width="0.5"/>
                <rect x="${plusHole1.x - plusH / 2}" y="${plusHole1.y - plusW / 2}" width="${plusH}" height="${plusW}" fill="none" stroke="${lighterColor}" stroke-width="0.5"/>
                <rect x="${plusHole2.x - plusW / 2}" y="${plusHole2.y - plusH / 2}" width="${plusW}" height="${plusH}" fill="none" stroke="${lighterColor}" stroke-width="0.5"/>
                <rect x="${plusHole2.x - plusH / 2}" y="${plusHole2.y - plusW / 2}" width="${plusH}" height="${plusW}" fill="none" stroke="${lighterColor}" stroke-width="0.5"/>
                
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="12" fill="${color}" stroke="${lighterColor}" stroke-width="1"/>
                
                <!-- Center Axle (Fixed large size for 36T) -->
                <path d="M 42 50 H 58 M 50 42 V 58" stroke="${isMotor ? '#fbbf24' : '#ef4444'}" stroke-width="5" stroke-linecap="round"/>
            </svg>`;
        }

        // Special SVG generator for 20T Gear (Double Bevel Style - Tan)
        function generate20TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -25);
            const innerRingColor = adjustColor(color, -50); // Darker inner ring

            // Path Data Generating Logic for 20T (Trapezoidal teeth)
            let pathD = "";
            const numTeeth = 20;
            const cx = 50, cy = 50;
            const rBase = 40;
            const rTip = 54;  // Slightly longer teeth
            const rad = Math.PI / 180;
            const toothBaseSpan = 10; // Degrees (base width)
            const toothTipSpan = 5;   // Degrees (tip width - narrower for trapezoid)

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                // Angles for corners
                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;
                const aTipRight = angle - toothTipSpan / 2;
                const aTipLeft = angle + toothTipSpan / 2;

                // Coordinates
                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos(aTipRight * rad);
                const yTipR = cy + rTip * Math.sin(aTipRight * rad);
                const xTipL = cx + rTip * Math.cos(aTipLeft * rad);
                const yTipL = cy + rTip * Math.sin(aTipLeft * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    // Arc along the base circle between teeth
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                // Draw trapezoidal tooth with straight lines
                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const angleFirst = 0;
            const xBaseRFirst = cx + rBase * Math.cos((angleFirst - toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((angleFirst - toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            // Hole positions (4 holes at 45, 135, 225, 315 degrees)
            const holeRadius = 8;
            const holeDistance = 26; // Distance from center
            const holeAngles = [45, 135, 225, 315];
            const holePositions = holeAngles.map(a => ({
                x: cx + holeDistance * Math.cos(a * rad),
                y: cy + holeDistance * Math.sin(a * rad)
            }));

            // Static Mask ID
            const maskId = "mask_20t_holes";

            return `
            <svg width="100%" height="100%" viewBox="-10 -10 120 120" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="-10" y="-10" width="120" height="120" fill="white"/>
                        <!-- 4 Holes -->
                        <circle cx="${holePositions[0].x}" cy="${holePositions[0].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[1].x}" cy="${holePositions[1].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[2].x}" cy="${holePositions[2].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[3].x}" cy="${holePositions[3].y}" r="${holeRadius}" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Main Gear Body with Teeth (Masked for holes) -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1.5" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Dark Ring (Shadow/Depth - also masked) -->
                <circle cx="50" cy="50" r="28" fill="none" stroke="${innerRingColor}" stroke-width="6" opacity="0.5" mask="url(#${maskId})"/>
                
                <!-- Hole Borders -->
                <circle cx="${holePositions[0].x}" cy="${holePositions[0].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[1].x}" cy="${holePositions[1].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[2].x}" cy="${holePositions[2].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="${holePositions[3].x}" cy="${holePositions[3].y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="16" fill="${color}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Axle (Plus Shape) - Dynamic Size -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }


        // Special SVG generator for 28T Gear (Double Bevel Style - based on 20T logic but larger)
        function generate28TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -20);
            const innerRingColor = adjustColor(color, -30);

            let pathD = "";
            const numTeeth = 28;
            const cx = 50, cy = 50;

            // Adjusted sizes for 28T (relative to 100x100 viewBox)
            // 20T used rBase=40, rTip=54. 28T is larger, but fits in same viewBox by scaling or filling more.
            // Since all gears fill the 100x100 box, we keep similar proportions but increase tooth density.
            // Actuall, to keep consistent style, we use similar radii but tooth count handles the look.
            // Wait, for same viewBox, more teeth = smaller teeth.
            const rBase = 42;
            const rTip = 54;
            const rad = Math.PI / 180;
            const toothBaseSpan = 360 / numTeeth * 0.6; // 60% of pitch
            const toothTipSpan = 360 / numTeeth * 0.3;  // 30% of pitch

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;
                const aTipRight = angle - toothTipSpan / 2;
                const aTipLeft = angle + toothTipSpan / 2;

                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos(aTipRight * rad);
                const yTipR = cy + rTip * Math.sin(aTipRight * rad);
                const xTipL = cx + rTip * Math.cos(aTipLeft * rad);
                const yTipL = cy + rTip * Math.sin(aTipLeft * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const angleFirst = 0;
            const xBaseRFirst = cx + rBase * Math.cos((angleFirst - toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((angleFirst - toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            // 4 Keyholes
            const holeRadius = 9; // Slightly larger holes for larger gear
            const holeDistance = 28;
            const holeAngles = [45, 135, 225, 315];
            const holePositions = holeAngles.map(a => ({
                x: cx + holeDistance * Math.cos(a * rad),
                y: cy + holeDistance * Math.sin(a * rad)
            }));

            const maskId = "mask_28t_holes";

            return `
            <svg width="100%" height="100%" viewBox="-10 -10 120 120" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="-10" y="-10" width="120" height="120" fill="white"/>
                        <circle cx="${holePositions[0].x}" cy="${holePositions[0].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[1].x}" cy="${holePositions[1].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[2].x}" cy="${holePositions[2].y}" r="${holeRadius}" fill="black"/>
                        <circle cx="${holePositions[3].x}" cy="${holePositions[3].y}" r="${holeRadius}" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Body -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1.5" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Ring -->
                <circle cx="50" cy="50" r="30" fill="none" stroke="${innerRingColor}" stroke-width="5" opacity="0.4" mask="url(#${maskId})"/>
                
                <!-- Hole Borders -->
                ${holePositions.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${holeRadius}" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>`).join('')}
                
                <!-- Hub -->
                <circle cx="50" cy="50" r="16" fill="${color}" stroke="${darkerColor}" stroke-width="1"/>
                
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 24T Gear (Based on User Reference)
        function generate24TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -20);

            // Path Data Generating Logic for 24T
            let pathD = "";
            const numTeeth = 24;
            const cx = 50, cy = 50;
            const rBase = 36;  // Smaller body
            const rTip = 48;   // Shorter teeth
            const rad = Math.PI / 180;
            const toothSpan = 8;
            const tipSpan = 3;

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                // Angles
                const aBaseRight = angle - toothSpan / 2;
                const aBaseLeft = angle + toothSpan / 2;
                const aTipRight = angle - tipSpan / 2;
                const aTipLeft = angle + tipSpan / 2;

                // Coordinates
                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos(aTipRight * rad);
                const yTipR = cy + rTip * Math.sin(aTipRight * rad);
                const xTipL = cx + rTip * Math.cos(aTipLeft * rad);
                const yTipL = cy + rTip * Math.sin(aTipLeft * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                // Control points
                const cpR_x = cx + (rBase + 5) * Math.cos((angle - 4) * rad);
                const cpR_y = cy + (rBase + 5) * Math.sin((angle - 4) * rad);
                const cpL_x = cx + (rBase + 5) * Math.cos((angle + 4) * rad);
                const cpL_y = cy + (rBase + 5) * Math.sin((angle + 4) * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                // Draw Tooth
                pathD += ` Q ${cpR_x} ${cpR_y} ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` Q ${cpL_x} ${cpL_y} ${xBaseL} ${yBaseL}`;
            }

            // Close loop
            const angleFirst = 0;
            const xBaseRFirst = cx + rBase * Math.cos((angleFirst - toothSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((angleFirst - toothSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            // Static Mask ID
            const maskId = "mask_24t_holes";

            return `
            <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="0" y="0" width="100" height="100" fill="white"/>
                        <circle cx="36" cy="36" r="9" fill="black"/>
                        <circle cx="64" cy="36" r="9" fill="black"/>
                        <circle cx="36" cy="64" r="9" fill="black"/>
                        <circle cx="64" cy="64" r="9" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Main Body with Mask (Creates holes) -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Borders for Holes -->
                <circle cx="36" cy="36" r="9" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="64" cy="36" r="9" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="36" cy="64" r="9" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                <circle cx="64" cy="64" r="9" fill="none" stroke="${darkerColor}" stroke-width="1.5"/>
                
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="14" fill="none" stroke="${darkerColor}" stroke-width="1"/>

                <!-- Center Axle (Plus Shape) - Dynamic Size -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 8T Gear (Type 2 - Unified Body)
        function generate8TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -20);
            const axleColor = isMotor ? '#f59e0b' : '#333';
            const axleStroke = isMotor ? '#d97706' : '#222';

            // Path Data Generating Logic for Unified Body
            let pathD = "";
            const numTeeth = 8;
            const cx = 50, cy = 50;
            const rBase = 32; // Optimized radius
            const rTip = 52;  // Slightly shorter teeth

            const rad = Math.PI / 180;
            const toothSpan = 28; // Degrees width of tooth base (wider)
            const tipSpan = 12;    // Degrees width of tooth tip (wider)

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                // Angles
                const aBaseRight = angle - toothSpan / 2;
                const aBaseLeft = angle + toothSpan / 2;
                const aTipRight = angle - tipSpan / 2;
                const aTipLeft = angle + tipSpan / 2;

                // Coordinates
                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);

                const xTipR = cx + rTip * Math.cos(aTipRight * rad);
                const yTipR = cy + rTip * Math.sin(aTipRight * rad);

                const xTipL = cx + rTip * Math.cos(aTipLeft * rad);
                const yTipL = cy + rTip * Math.sin(aTipLeft * rad);

                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                // Control points for curvy tooth sides
                const cpR_x = cx + (rBase + 10) * Math.cos((angle - 10) * rad);
                const cpR_y = cy + (rBase + 10) * Math.sin((angle - 10) * rad);

                const cpL_x = cx + (rBase + 10) * Math.cos((angle + 10) * rad);
                const cpL_y = cy + (rBase + 10) * Math.sin((angle + 10) * rad);

                // Start path or arc from previous
                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    // Arc from previous BaseLeft to current BaseRight
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                // Draw Tooth
                // 1. Curve up to tip right
                pathD += ` Q ${cpR_x} ${cpR_y} ${xTipR} ${yTipR}`;

                // 2. Tip arc (round top)
                pathD += ` A 5 5 0 0 1 ${xTipL} ${yTipL}`;

                // 3. Curve down to base left
                pathD += ` Q ${cpL_x} ${cpL_y} ${xBaseL} ${yBaseL}`;
            }

            // Close the loop (Arc from last tooth to first)
            const angleFirst = 0;
            const xBaseRFirst = cx + rBase * Math.cos((angleFirst - toothSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((angleFirst - toothSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst}`;
            pathD += " Z";

            return `
            <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                <!-- Unified Gear Body -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="1.5" stroke-linejoin="round"/>
                
                <!-- Inner detailing for depth -->
                <circle cx="50" cy="50" r="22" fill="none" stroke="${darkerColor}" stroke-width="1" opacity="0.4"/>
                
                <!-- Inner Hub Supports -->
                 <path d="M50 22 L50 32" stroke="${darkerColor}" stroke-width="3" stroke-linecap="round"/>
                 <path d="M50 78 L50 68" stroke="${darkerColor}" stroke-width="3" stroke-linecap="round"/>
                 <path d="M22 50 L32 50" stroke="${darkerColor}" stroke-width="3" stroke-linecap="round"/>
                 <path d="M78 50 L68 50" stroke="${darkerColor}" stroke-width="3" stroke-linecap="round"/>

                 <!-- Center Axle (Plus Shape) -->
                 <!-- Center Axle (Plus Shape) - Dynamic Size -->
                 ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Special SVG generator for 40T Gear (Realistic Design)
        function generate40TGearSVG(teeth, color, size, isMotor) {
            const darkerColor = adjustColor(color, -30);
            const lighterColor = adjustColor(color, 20);
            const holeBorder = adjustColor(color, -15);
            const cx = 50, cy = 50;
            const rad = Math.PI / 180;

            // Generate trapezoid teeth path (like 36T approach)
            let pathD = '';
            const numTeeth = 40;
            const rBase = 44;
            const rTip = 50;
            const toothBaseSpan = 5;  // Degrees - tooth base width
            const toothTipSpan = 3;   // Degrees - tooth tip width

            for (let i = 0; i < numTeeth; i++) {
                const angle = (i * 360) / numTeeth;

                const aBaseRight = angle - toothBaseSpan / 2;
                const aBaseLeft = angle + toothBaseSpan / 2;

                const xBaseR = cx + rBase * Math.cos(aBaseRight * rad);
                const yBaseR = cy + rBase * Math.sin(aBaseRight * rad);
                const xTipR = cx + rTip * Math.cos((angle - toothTipSpan / 2) * rad);
                const yTipR = cy + rTip * Math.sin((angle - toothTipSpan / 2) * rad);
                const xTipL = cx + rTip * Math.cos((angle + toothTipSpan / 2) * rad);
                const yTipL = cy + rTip * Math.sin((angle + toothTipSpan / 2) * rad);
                const xBaseL = cx + rBase * Math.cos(aBaseLeft * rad);
                const yBaseL = cy + rBase * Math.sin(aBaseLeft * rad);

                if (i === 0) {
                    pathD += `M ${xBaseR} ${yBaseR}`;
                } else {
                    pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseR} ${yBaseR}`;
                }

                pathD += ` L ${xTipR} ${yTipR}`;
                pathD += ` L ${xTipL} ${yTipL}`;
                pathD += ` L ${xBaseL} ${yBaseL}`;
            }
            // Close loop
            const xBaseRFirst = cx + rBase * Math.cos((-toothBaseSpan / 2) * rad);
            const yBaseRFirst = cy + rBase * Math.sin((-toothBaseSpan / 2) * rad);
            pathD += ` A ${rBase} ${rBase} 0 0 1 ${xBaseRFirst} ${yBaseRFirst} Z`;

            // Generate 8 outer holes (at r=30)
            const outerHoles = [0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
                const r = angle * rad;
                return { x: cx + 30 * Math.cos(r), y: cy + 30 * Math.sin(r), r: 8 };
            });

            // Generate 8 inner holes (at r=17)
            const innerHoles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(angle => {
                const r = angle * rad;
                return { x: cx + 17 * Math.cos(r), y: cy + 17 * Math.sin(r), r: 5 };
            });

            const allHoles = [...outerHoles, ...innerHoles];
            const maskId = 'mask_40t_holes';

            return `
            <svg width="100%" height="100%" viewBox="0 0 100 100" style="overflow:visible">
                <defs>
                    <mask id="${maskId}">
                        <rect x="0" y="0" width="100" height="100" fill="white"/>
                        ${allHoles.map(h => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="black"/>`).join('')}
                        <circle cx="${cx}" cy="${cy}" r="5" fill="black"/>
                    </mask>
                </defs>
                
                <!-- Main Gear Body with Teeth (Masked) - like 36T -->
                <path d="${pathD}" fill="${color}" stroke="${darkerColor}" stroke-width="0.5" stroke-linejoin="round" mask="url(#${maskId})"/>
                
                <!-- Inner Ring (masked) -->
                <circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${lighterColor}" stroke-width="2" opacity="0.3" mask="url(#${maskId})"/>
                
                <!-- 4 Spokes (masked) -->
                <line x1="${cx - 40}" y1="${cy}" x2="${cx + 40}" y2="${cy}" stroke="${color}" stroke-width="4" mask="url(#${maskId})"/>
                <line x1="${cx}" y1="${cy - 40}" x2="${cx}" y2="${cy + 40}" stroke="${color}" stroke-width="4" mask="url(#${maskId})"/>
                
                <!-- Hole Borders -->
                ${allHoles.map(h => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="none" stroke="${holeBorder}" stroke-width="1"/>`).join('')}
                
                <!-- Center Hub -->
                <circle cx="${cx}" cy="${cy}" r="10" fill="${color}" stroke="${darkerColor}" stroke-width="1"/>
                
                <!-- Center Axle -->
                ${generateDynamicAxlePath(size, isMotor)}
            </svg>`;
        }

        // Helper function to adjust color brightness
        function adjustColor(hex, amount) {
            const num = parseInt(hex.replace('#', ''), 16);
            const r = Math.min(255, Math.max(0, (num >> 16) + amount));
            const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
            const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
            return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
