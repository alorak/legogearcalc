// Shared configuration, application state, and small helpers.

// --- CONFIGURATION ---

        // 1 Stud (Hole center-to-center spacing) in pixels
        const STUD_SPACING = 50;

        // Gear Definitions
        // radius: The pitch radius in "studs".
        // Diameter = 2 * radius.
        // Example: 8T has 0.5 stud radius (1 stud diameter). Fits perfectly with another 8T on adjacent hole (dist 1).
        const REBRICKABLE_ELEMENT_CDN = 'https://cdn.rebrickable.com/media/parts/elements';
        const ICON_SPRITE_URL = './assets/icons.svg';

        // elementId controls only the palette photo. Physics/rendering still use teeth/radius/type.
        const GEARS = [
            { teeth: 0, radius: 0.5, color: '#FFD706', type: 'bush', partNum: '32123b', elementId: '6271167' },
            { teeth: 8, radius: 0.5, color: '#A4A5AF', type: 'spur', partNum: '10928', elementId: '6012451' },
            { teeth: 12, radius: 0.75, color: '#0066cc', type: 'bevel', partNum: '32270', elementId: '4177431' },
            { teeth: 16, radius: 1.0, color: '#a0a0a0', type: 'spur', partNum: '94925', elementId: '4640536' },
            { teeth: 20, radius: 1.25, color: '#e4cd9e', type: 'double', partNum: '32269', elementId: '6346517' },
            { teeth: 24, radius: 1.5, color: '#595d60', type: 'spur', partNum: '3648b', elementId: '4514558' },
            { teeth: 28, radius: 1.75, color: '#9ca3af', type: 'double', partNum: '46372', elementId: '6259270' },
            { teeth: 36, radius: 2.25, color: '#1a1a1a', type: 'spur', partNum: '32498', elementId: '4255563' },
            { teeth: 40, radius: 2.5, color: '#7f8c8d', type: 'spur', partNum: '3649', elementId: '6195314' }
        ];

        function rebrickableElementImage(elementId) {
            return `${REBRICKABLE_ELEMENT_CDN}/${elementId}.jpg`;
        }

        function iconSvg(name, className = 'ui-icon') {
            return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="${ICON_SPRITE_URL}#icon-${name}"></use></svg>`;
        }

        // --- STATE ---
        let selectedGearIndex = null;
        // 2D board state: boardState[beamIndex][holeIndex]
        let boardState = [];
        let isRunning = false;
        let animationFrameId;
        let deleteMode = false;
        let motorMode = false;
        let beamCount = 1; // Number of beams (1-5)
        // Motor position: { beamIndex, holeIndex } or null
        let motorPosition = null;
        // Motor direction: 1 = clockwise, -1 = counter-clockwise
        let motorDirection = 1;
        // Beam Color: blue, red, yellow, green, white, black
        let beamColor = 'blue';
        let toothMode = false;
        let currentPointerAngle = 0;

        // Axle rotation is the single source of truth for every gear stacked on the same hole.
        // Gear angle/velocity fields are kept synchronized for compatibility with existing UI/report code.
        let axleState = [];

        function createAxleState() {
            return { angle: 0, velocity: 0 };
        }

        function initAxleState() {
            axleState = [];
            for (let beamIndex = 0; beamIndex < 5; beamIndex++) {
                axleState.push(Array.from({ length: 11 }, createAxleState));
            }
        }

        function resizeAxleState(count) {
            const next = [];
            for (let beamIndex = 0; beamIndex < count; beamIndex++) {
                const existing = axleState[beamIndex];
                next.push(existing || Array.from({ length: 11 }, createAxleState));
            }
            axleState = next;
        }

        function ensureAxleState(beamIndex, holeIndex) {
            if (!axleState[beamIndex]) {
                axleState[beamIndex] = Array.from({ length: 11 }, createAxleState);
            }
            if (!axleState[beamIndex][holeIndex]) {
                axleState[beamIndex][holeIndex] = createAxleState();
            }
            return axleState[beamIndex][holeIndex];
        }

        function syncGearStackToAxle(beamIndex, holeIndex) {
            const axle = ensureAxleState(beamIndex, holeIndex);
            let gear = boardState[beamIndex] ? boardState[beamIndex][holeIndex] : null;
            while (gear) {
                gear.angle = axle.angle;
                gear.velocity = axle.velocity;
                gear = gear.nextLayer;
            }
        }

        function getAxleAngle(beamIndex, holeIndex) {
            return ensureAxleState(beamIndex, holeIndex).angle;
        }

        function setAxleAngle(beamIndex, holeIndex, angle) {
            const axle = ensureAxleState(beamIndex, holeIndex);
            axle.angle = Number.isFinite(angle) ? angle : 0;
            syncGearStackToAxle(beamIndex, holeIndex);
            return axle.angle;
        }

        function getAxleVelocity(beamIndex, holeIndex) {
            return ensureAxleState(beamIndex, holeIndex).velocity;
        }

        function setAxleVelocity(beamIndex, holeIndex, velocity) {
            const axle = ensureAxleState(beamIndex, holeIndex);
            axle.velocity = Number.isFinite(velocity) ? velocity : 0;
            syncGearStackToAxle(beamIndex, holeIndex);
            return axle.velocity;
        }

        function resetAllAxleVelocities() {
            for (let beamIndex = 0; beamIndex < axleState.length; beamIndex++) {
                if (!axleState[beamIndex]) continue;
                for (let holeIndex = 0; holeIndex < axleState[beamIndex].length; holeIndex++) {
                    setAxleVelocity(beamIndex, holeIndex, 0);
                }
            }
        }

        // Manual Gear Rotation State (Kinematic Drag)
        let gearConnectionsMap = {};
        let isDraggingGear = false;
        let draggedGearKey = null; // { beamIndex, holeIndex }
        let lastMouseX = 0;

        // Initialize board state for given beam count
        function initBoardState() {
            boardState = [];
            for (let i = 0; i < 5; i++) { // Max 5 beams
                boardState.push(new Array(11).fill(null));
            }
            initAxleState();
            motorPosition = null;
            updateMotorInfoPanel();
        }

        function setBeamColor(color) {
            beamColor = color;
            if (typeof updateBeamColorControl === 'function') {
                updateBeamColorControl(color);
            }
            renderBeam();
        }

        // --- HELPERS ---
        function updateStatus(message, isWarning = false) {
            // Status bar disabled
        }
