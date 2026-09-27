// UI initialization and controls. Loaded after config.js.

// --- INIT ---
        function init() {
            initBoardState();
            renderPalette();
            renderBeam();
            setupEventListeners();
            updateSpeedLabel(); // Initialize speed label with RPM
        }

        function setupEventListeners() {
            document.getElementById('toggleRun').addEventListener('click', toggleSimulation);
            document.getElementById('runOneTurn').addEventListener('click', runOneTurn);
            document.getElementById('clearBoard').addEventListener('click', clearBoard);

            // Drag Events (Global)
            document.addEventListener('mousemove', handleGearDrag);
            document.addEventListener('mouseup', endGearDrag);
            document.addEventListener('click', () => closeSidebarPickers());
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') closeSidebarPickers();
            });

            // Clear highlight when clicking on empty space in simulation container
            document.getElementById('simContainer').addEventListener('click', function (e) {
                // Only clear if clicking on background (not on holes, gears, or buttons)
                if (e.target.classList.contains('simulation-container') ||
                    e.target.classList.contains('beam-content-area') ||
                    e.target.classList.contains('technic-beam') ||
                    e.target.classList.contains('beam-wrapper')) {
                    if (typeof clearHighlight === 'function') {
                        clearHighlight();
                    }
                    // Reset Modes
                    if (selectedGearIndex !== null) {
                        selectedGearIndex = null;
                        document.querySelectorAll('.gear-option').forEach(el => el.classList.remove('selected'));
                    }
                    if (toothMode) toggleToothMode();
                }
            });
        }

        function updateSpeedLabel() {
            const slider = document.getElementById('speedSlider');
            const label = document.getElementById('speedLabel');
            if (slider && label) {
                const val = parseFloat(slider.value);
                const rpm = Math.round(val * 300);
                label.textContent = `${val}x (${rpm} RPM)`;
            }
        }

        function updateMotorInfoPanel() {
            const motorInfo = document.getElementById('motorInfo');
            const motorHelpText = document.getElementById('motorHelpText');
            const motorPositionLabel = document.getElementById('motorPositionLabel');

            if (motorPosition) {
                motorInfo.style.display = 'block';
                motorHelpText.style.display = 'none';
                motorPositionLabel.textContent = `Kiriş ${motorPosition.beamIndex + 1}, Delik ${motorPosition.holeIndex + 1}`;
            } else {
                motorInfo.style.display = 'none';
                motorHelpText.style.display = 'block';
            }
        }

        function setMotorDirection(dir) {
            motorDirection = dir;

            // Update button states
            document.getElementById('motorDirCW').classList.toggle('active', dir === 1);
            document.getElementById('motorDirCCW').classList.toggle('active', dir === -1);
        }

        function clearBoard() {
            document.getElementById('confirmModal').classList.add('active');
        }

        function closeConfirmModal(event) {
            if (!event || event.target.id === 'confirmModal' || (event.target.classList && event.target.classList.contains('close-btn'))) {
                document.getElementById('confirmModal').classList.remove('active');
            }
            // For manual close
            if (!event) document.getElementById('confirmModal').classList.remove('active');
        }

        function executeClearBoard() {
            initBoardState();
            stopSimulation();
            motorPosition = null;
            updateMotorInfoPanel();
            renderBeam();
            renderSideView();
            validateAndCalculate();
            updateStatus(t('allCleared'));
            renderSimulationStats();
            document.getElementById('confirmModal').classList.remove('active');
        }

        function toggleDeleteMode() {
            deleteMode = !deleteMode;
            selectedGearIndex = null;

            // Update UI
            document.querySelectorAll('.gear-option').forEach(el => el.classList.remove('selected'));
            const btn = document.getElementById('deleteModeBtn');
            const simContainer = document.getElementById('simContainer');

            const trashIcon = iconSvg('trash', 'ui-icon ui-icon--sm');

            if (deleteMode) {
                btn.classList.add('active');
                btn.innerHTML = trashIcon + t('deleteGear');
                simContainer.classList.add('delete-mode');
                updateStatus(t('deleteMode'));
            } else {
                btn.classList.remove('active');
                btn.innerHTML = trashIcon + t('deleteGear');
                simContainer.classList.remove('delete-mode');
                updateStatus('Silme modu kapatıldı.');
            }
        }

        function rotatePointerSetting() {
            currentPointerAngle = (currentPointerAngle + 90) % 360;
            const display = document.getElementById('pointerAngleDisplay');
            if (display) display.innerText = currentPointerAngle + '°';

            // Rotate Button Icon
            const icon = document.getElementById('toothBtnIcon');
            if (icon) icon.style.transform = `rotate(${currentPointerAngle}deg)`;
        }

        function toggleToothMode() {
            toothMode = !toothMode;
            // Reset other modes
            if (toothMode) {
                deleteMode = false;
                motorMode = false;
                selectedGearIndex = null;
            }
            updateStatus(toothMode ? t('toothMode') : t('toothModeOff'));
            renderBeam(); // To update UI states

            // Update UI Buttons
            const btn = document.getElementById('toothModeBtn');
            const panel = document.getElementById('toothSettingsPanel');
            const deleteBtn = document.getElementById('deleteModeBtn');
            const motorBtn = document.getElementById('motorModeBtn');

            // Toggle classes
            if (toothMode) {
                // Active: Orange
                btn.style.backgroundColor = '#fff7ed';
                btn.style.borderColor = '#fdba74';
                btn.style.color = '#c2410c';
                btn.classList.add('active');

                if (panel) panel.style.display = 'block';
                if (deleteBtn) deleteBtn.classList.remove('active');
                if (motorBtn) motorBtn.classList.remove('active');

                // Clear selection visual
                document.querySelectorAll('.gear-option').forEach(el => el.classList.remove('selected'));
                document.getElementById('simContainer').classList.remove('delete-mode');
            } else {
                // Inactive: Gray
                btn.style.backgroundColor = '#f8fafc';
                btn.style.borderColor = '#cbd5e1';
                btn.style.color = '#64748b';
                btn.classList.remove('active');

                if (panel) panel.style.display = 'none';
            }
        }


        function toggleMotorMode() {
            motorMode = !motorMode;
            deleteMode = false;
            selectedGearIndex = null;

            // Update UI
            document.querySelectorAll('.gear-option').forEach(el => el.classList.remove('selected'));
            document.getElementById('deleteModeBtn').classList.remove('active');
            const trashIcon = iconSvg('trash', 'ui-icon ui-icon--sm');
            document.getElementById('deleteModeBtn').innerHTML = trashIcon + t('deleteGear');
            document.getElementById('simContainer').classList.remove('delete-mode');

            const btn = document.getElementById('motorModeBtn');

            if (motorMode) {
                btn.classList.add('active');
                btn.innerHTML = '⚡ Motor Ekle (Aktif)';
                updateStatus('Motor modu aktif. Motor yerleştirmek istediğiniz deliğe tıklayın.');
            } else {
                btn.classList.remove('active');
                btn.innerHTML = '⚡ Motor Ekle';
                updateStatus('Motor modu kapatıldı.');
            }
        }

        function closeSidebarPickers(exceptMenuId = null) {
            ['beamCountMenu', 'beamColorMenu'].forEach(menuId => {
                if (menuId === exceptMenuId) return;
                const menu = document.getElementById(menuId);
                if (menu) menu.classList.remove('open');
            });

            [['beamCountPicker', 'beamCountMenu'], ['beamColorPicker', 'beamColorMenu']].forEach(([buttonId, menuId]) => {
                if (menuId === exceptMenuId) return;
                const button = document.getElementById(buttonId);
                if (button) button.setAttribute('aria-expanded', 'false');
            });
        }

        function toggleSidebarPicker(buttonId, menuId, event) {
            if (event) event.stopPropagation();
            const button = document.getElementById(buttonId);
            const menu = document.getElementById(menuId);
            if (!button || !menu) return;

            const willOpen = !menu.classList.contains('open');
            closeSidebarPickers(willOpen ? menuId : null);
            menu.classList.toggle('open', willOpen);
            button.setAttribute('aria-expanded', String(willOpen));
        }

        function toggleBeamCountMenu(event) {
            toggleSidebarPicker('beamCountPicker', 'beamCountMenu', event);
        }

        function toggleBeamColorMenu(event) {
            toggleSidebarPicker('beamColorPicker', 'beamColorMenu', event);
        }

        function selectBeamCount(count, event) {
            if (event) event.stopPropagation();
            setBeamCount(count);
            closeSidebarPickers();
        }

        function selectBeamColor(color, event) {
            if (event) event.stopPropagation();
            setBeamColor(color);
            closeSidebarPickers();
        }

        function updateBeamColorControl(color) {
            const colorMap = {
                blue: '#0055BF',
                red: '#C91A09',
                yellow: '#F2CD37',
                green: '#237841',
                white: '#FFFFFF',
                black: '#1e293b'
            };
            const swatch = document.getElementById('beamColorSwatch');
            if (swatch && colorMap[color]) swatch.style.setProperty('--swatch-color', colorMap[color]);

            document.querySelectorAll('.color-option').forEach(option => {
                option.classList.toggle('selected', option.dataset.color === color);
            });
        }

        function setBeamCount(count) {
            beamCount = count;

            const countValue = document.getElementById('beamCountValue');
            if (countValue) countValue.textContent = String(count);

            document.querySelectorAll('.beam-count-option').forEach(option => {
                option.classList.toggle('selected', parseInt(option.dataset.count, 10) === count);
            });

            // Resize boardState keeping existing data
            const newBoardState = [];
            for (let i = 0; i < count; i++) {
                if (i < boardState.length) {
                    newBoardState.push(boardState[i]);
                } else {
                    newBoardState.push(new Array(11).fill(null));
                }
            }
            boardState = newBoardState;

            // Check if motor was on a removed beam
            if (motorPosition && motorPosition.beamIndex >= beamCount) {
                motorPosition = null;
                updateMotorInfoPanel();
            }

            stopSimulation();
            renderBeam();
            updateStatus(`${count} kiriş seçildi.`);
        }
