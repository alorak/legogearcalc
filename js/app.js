// Drag handling, translations, language setup, and final application bootstrap.

// Init logic...

        // --- DRAG ROTATION LOGIC ---
        function startGearDrag(event, beamIndex, holeIndex) {
            // Only allow if no modal tools selected
            if (deleteMode || motorMode || selectedGearIndex !== null) return;
            // Also prevent if button/input clicked
            if (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT') return;

            isDraggingGear = true;
            draggedGearKey = { beamIndex, holeIndex };
            lastMouseX = event.clientX;
            // event.preventDefault(); // Don't prevent default completely to allow click for hole selection if just a click
        }

        function handleGearDrag(event) {
            if (!isDraggingGear || !draggedGearKey) return;

            const deltaX = event.clientX - lastMouseX;
            if (deltaX === 0) return;

            const sensitivity = 2; // Degrees per pixel
            const angleDelta = deltaX * sensitivity;

            rotateGearNetwork(draggedGearKey.beamIndex, draggedGearKey.holeIndex, angleDelta);
            renderBeam();

            lastMouseX = event.clientX;
        }

        function endGearDrag(event) {
            isDraggingGear = false;
            draggedGearKey = null;
        }

        function rotateGearNetwork(startBeam, startHole, deltaAngle) {
            const queue = [{ b: startBeam, h: startHole, delta: deltaAngle }];
            const visited = new Set();
            visited.add(`${startBeam}_${startHole}`);

            if (boardState[startBeam] && boardState[startBeam][startHole]) {
                setAxleAngle(
                    startBeam,
                    startHole,
                    getAxleAngle(startBeam, startHole) + deltaAngle
                );
            }

            let head = 0;
            while (head < queue.length) {
                const { b, h, delta } = queue[head++];
                const key = `${b}_${h}`;

                const neighbors = gearConnectionsMap[key] || [];
                for (const neighbor of neighbors) {
                    const neighborKey = `${neighbor.b}_${neighbor.h}`;
                    if (visited.has(neighborKey)) continue;

                    visited.add(neighborKey);
                    const neighborDelta = delta * neighbor.ratio;

                    if (boardState[neighbor.b] && boardState[neighbor.b][neighbor.h]) {
                        setAxleAngle(
                            neighbor.b,
                            neighbor.h,
                            getAxleAngle(neighbor.b, neighbor.h) + neighborDelta
                        );
                    }

                    queue.push({ b: neighbor.b, h: neighbor.h, delta: neighborDelta });
                }
            }
        }


        // Translation System - must be defined before init()

        // Translation System
        const translations = {
            en: {
                teeth: 'Teeth',
                bore: 'Bore',
                deleteGear: 'Delete Gear',
                selectGear: 'Selected: <strong>{0} Teeth</strong>. Click a hole on the beam.',
                selectBore: 'Selected: <strong>Bore (Spacer)</strong>. Click a hole.',
                deleteMode: 'Delete mode active. Click on hole to remove gear.',
                toothMode: 'Tooth mode active. Set direction and click a gear.',
                toothModeOff: 'Tooth mode disabled.',
                allCleared: 'All gears cleared.',
                layerRemoved: 'Top layer gear removed.',
                gearRemoved: '{0} Teeth gear removed.',
                noGearToRemove: 'No gear to remove in this hole.',
                selectGearFirst: '⚠️ Please select a gear from the left panel first.',
                layerAdded: 'Added gear to layer 2.',
                gearsPlaced: 'Gears placed.',
                gearsIndependent: 'Gears are independent.',
                collision: '⚠️ Collision (Bore): (B{0}-B{1})',
                motorMissing: 'Motor Missing',
                motorMissingMsg: 'Please place a motor first to rotate 1 turn.',
                error: 'Error',
                conflictGears: 'There are conflicting gears! Please fix the errors first.',
                noGears: 'No Gears',
                noGearsMsg: 'Place at least one gear to generate report.',
                gear: 'Gear',
                simCannotStart: 'Simulation cannot start: There are conflicting gears! Please fix the red marked errors.',
                motorMissingSimMsg: 'Please place a motor from section "3. Add Motor" to start simulation.',
                noGearsToRotate: 'No gears to rotate.',
                cannotPlacePart: 'Cannot Place Part',
                placementCollision: 'This part cannot be placed here because it physically overlaps another part on the same layer.',
                placementPhaseConflict: 'This gear cannot mesh with all neighboring gears at the same time. The tooth phases are incompatible.',
                maxGearLayers: 'This axle already has the maximum of 2 gear layers.',
                toothNeedsGear: 'Place a gear first, then add the Tooth pointer to that gear.',
                kinematicConflict: 'This gear network contains a ratio cycle that cannot rotate consistently.'
            },
            tr: {
                teeth: 'Diş',
                bore: 'Burç',
                deleteGear: 'Dişli Sil',
                selectGear: 'Seçili: <strong>{0} Diş</strong>. Mavi kiriş üzerindeki bir deliğe tıklayın.',
                selectBore: 'Seçili: <strong>Burç (Boşluk)</strong>. Bir deliğe tıklayın.',
                deleteMode: 'Silme modu aktif. Kaldırmak istediğiniz dişlinin deliğine tıklayın.',
                toothMode: 'Tooth modu aktif. Yönü ayarlayıp dişliye tıklayın.',
                toothModeOff: 'Tooth modu kapatıldı.',
                allCleared: 'Tüm dişliler temizlendi.',
                layerRemoved: 'Üst katmandaki dişli kaldırıldı.',
                gearRemoved: '{0} Diş dişli kaldırıldı.',
                noGearToRemove: 'Bu delikte kaldırılacak dişli yok.',
                selectGearFirst: '⚠️ Lütfen önce sol taraftan bir dişli seçin.',
                layerAdded: '2. katmana dişli eklendi.',
                gearsPlaced: 'Dişliler yerleştirildi.',
                gearsIndependent: 'Dişliler bağımsız.',
                collision: '⚠️ Çarpışma (Burç): (K{0}-K{1})',
                motorMissing: 'Motor Eksik',
                motorMissingMsg: '1 tur döndürmek için önce bir motor yerleştirin.',
                error: 'Hata',
                conflictGears: 'Çakışan dişliler var! Lütfen önce hataları düzeltin.',
                noGears: 'Dişli Yok',
                noGearsMsg: 'Rapor oluşturmak için en az bir dişli yerleştirin.',
                gear: 'Dişli',
                simCannotStart: 'Simülasyon başlatılamaz: Çakışan dişliler var! Lütfen kırmızı ile işaretlenen hataları düzeltin.',
                motorMissingSimMsg: 'Simülasyonu başlatmak için lütfen önce "3. Motor Ekle" bölümünden bir motor yerleştirin.',
                noGearsToRotate: 'Döndürülecek dişli yok.',
                cannotPlacePart: 'Parça Eklenemiyor',
                placementCollision: 'Bu parça aynı katmandaki başka bir parçayla fiziksel olarak çakıştığı için buraya eklenemez.',
                placementPhaseConflict: 'Bu dişli tüm komşu dişlilerle aynı anda kavraşamaz. Diş fazları birbiriyle uyumsuz.',
                maxGearLayers: 'Bu aks üzerinde en fazla 2 dişli katmanı kullanılabilir.',
                toothNeedsGear: 'Önce bir dişli yerleştirin, ardından Tooth göstergesini o dişliye ekleyin.',
                kinematicConflict: 'Bu dişli ağında aynı anda tutarlı şekilde dönemeyen bir oran döngüsü var.'
            }
        };

        let currentLang = 'en';

        function t(key, ...args) {
            let text = translations[currentLang][key] || translations['en'][key] || key;
            args.forEach((arg, i) => {
                text = text.replace(`{${i}}`, arg);
            });
            return text;
        }

        // Language Switcher
        function setLang(lang) {
            currentLang = lang;
            document.body.className = 'lang-' + lang;
            document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = Array.from(document.querySelectorAll('.lang-btn')).find(b => b.innerText.toLowerCase() === lang);
            if (activeBtn) activeBtn.classList.add('active');
            localStorage.setItem('lego-lang', lang);
        }
        const savedLang = localStorage.getItem('lego-lang') || 'en';
        currentLang = savedLang;
        setLang(savedLang);

        // Start Initialization (must be after translations are defined)
        init();
