(() => {
    const results = [];

    function record(name, ok, detail = '') {
        results.push({ name, ok: Boolean(ok), detail: String(detail || '') });
    }

    function expect(name, condition, detail = '') {
        record(name, condition, detail);
    }

    function resetBoard(beams = 3) {
        beamCount = beams;
        boardState = Array.from({ length: beams }, () => new Array(11).fill(null));
        axleState = Array.from(
            { length: beams },
            () => Array.from({ length: 11 }, createAxleState)
        );
        motorPosition = null;
        gearConnectionsMap = {};
    }

    function gear(teeth) {
        return GEARS.find(item => item.teeth === teeth);
    }

    function bush() {
        return GEARS.find(item => item.type === 'bush');
    }

    function placeRaw(beamIndex, holeIndex, template, angle = 0, layerTemplate = null) {
        boardState[beamIndex][holeIndex] =
            instantiatePlacedGear(template, beamIndex, holeIndex, angle);

        if (layerTemplate) {
            boardState[beamIndex][holeIndex].nextLayer =
                instantiatePlacedGear(layerTemplate, beamIndex, holeIndex, angle);
        }

        setAxleAngle(beamIndex, holeIndex, angle);
    }

    // Placement and phase regression cases.
    resetBoard(1);
    placeRaw(0, 0, gear(8), 0);
    let placement = analyzeGearPlacement(0, 1, gear(8), 0);
    expect(
        'Adjacent 8T + 8T is accepted',
        placement.ok,
        JSON.stringify(placement)
    );
    expect(
        'Adjacent 8T gets the 22.5° half-tooth phase',
        placement.ok && circularDistance(placement.angle, 22.5, 45) < 1e-8,
        'angle=' + placement.angle
    );

    resetBoard(1);
    placeRaw(0, 0, bush(), 0);
    placement = analyzeGearPlacement(0, 1, gear(8), 0);
    expect(
        'Bush next to 8T is rejected as a physical collision',
        !placement.ok && placement.reason === 'collision',
        JSON.stringify(placement)
    );

    resetBoard(1);
    placeRaw(0, 0, gear(8), 0);
    placeRaw(0, 2, gear(8), 22.5);
    placement = analyzeGearPlacement(0, 1, gear(8), 0);
    expect(
        'Conflicting two-neighbor tooth phases are rejected',
        !placement.ok && placement.reason === 'phase-conflict',
        JSON.stringify(placement)
    );

    resetBoard(2);
    const verticalRelation = classifyGearPair(
        { beamIndex: 0, holeIndex: 0, gear: gear(8) },
        { beamIndex: 1, holeIndex: 0, gear: gear(8) }
    );
    expect(
        'Vertically adjacent 8T gears are not falsely classified as meshing',
        verticalRelation.type !== 'mesh',
        JSON.stringify(verticalRelation)
    );

    // Axle source-of-truth regression.
    resetBoard(1);
    placeRaw(0, 0, gear(8), 0, gear(24));
    setAxleAngle(0, 0, 37);
    setAxleVelocity(0, 0, -0.5);
    expect(
        'Stacked gears share one axle angle',
        boardState[0][0].angle === 37 &&
            boardState[0][0].nextLayer.angle === 37
    );
    expect(
        'Stacked gears share one axle velocity',
        boardState[0][0].velocity === -0.5 &&
            boardState[0][0].nextLayer.velocity === -0.5
    );

    // Ratio-cycle consistency.
    let graph = analyzeRatioGraph([
        { from: 'A', to: 'B', ratio: -1 },
        { from: 'B', to: 'C', ratio: -2 },
        { from: 'A', to: 'C', ratio: 2 }
    ]);
    expect(
        'Consistent ratio cycle is accepted',
        graph.ok,
        JSON.stringify(graph.conflicts)
    );

    graph = analyzeRatioGraph([
        { from: 'A', to: 'B', ratio: -1 },
        { from: 'B', to: 'C', ratio: -2 },
        { from: 'A', to: 'C', ratio: 3 }
    ]);
    expect(
        'Inconsistent ratio cycle is rejected',
        !graph.ok,
        JSON.stringify(graph.conflicts)
    );

    // Gear-pair matrix: integer pitch-center distances must mesh.
    const toothed = GEARS.filter(item => item.teeth > 0);
    for (let i = 0; i < toothed.length; i++) {
        for (let j = i; j < toothed.length; j++) {
            const gearA = toothed[i];
            const gearB = toothed[j];
            const idealDistance = (gearA.teeth + gearB.teeth) / 16;

            if (
                Number.isInteger(idealDistance) &&
                idealDistance >= 1 &&
                idealDistance <= 5
            ) {
                const relation = classifyGearPair(
                    { beamIndex: 0, holeIndex: 0, gear: gearA },
                    { beamIndex: 0, holeIndex: idealDistance, gear: gearB }
                );

                expect(
                    gearA.teeth + 'T + ' + gearB.teeth + 'T meshes at ' +
                        idealDistance + ' stud(s)',
                    relation.type === 'mesh',
                    JSON.stringify(relation)
                );
            } else {
                const nearestHole = Math.round(idealDistance);
                if (nearestHole >= 1 && nearestHole <= 5) {
                    const relation = classifyGearPair(
                        { beamIndex: 0, holeIndex: 0, gear: gearA },
                        { beamIndex: 0, holeIndex: nearestHole, gear: gearB }
                    );

                    expect(
                        gearA.teeth + 'T + ' + gearB.teeth +
                            'T does not falsely mesh at ' + nearestHole + ' stud(s)',
                        relation.type !== 'mesh',
                        JSON.stringify(relation)
                    );
                }
            }
        }
    }

    const body = document.getElementById('results');
    results.forEach(result => {
        const row = document.createElement('tr');
        row.innerHTML =
            '<td class="' + (result.ok ? 'ok' : 'bad') + '">' +
                (result.ok ? 'PASS' : 'FAIL') +
            '</td>' +
            '<td>' + result.name + '</td>' +
            '<td><code></code></td>';
        row.querySelector('code').textContent = result.detail;
        body.appendChild(row);
    });

    const failed = results.filter(result => !result.ok);
    const summary = document.getElementById('summary');
    summary.textContent =
        (failed.length === 0 ? 'PASS' : 'FAIL') + ': ' +
        (results.length - failed.length) + '/' + results.length +
        ' regression checks passed.';
    summary.className = failed.length === 0 ? 'pass' : 'fail';

    if (failed.length > 0) {
        console.error('Gear regression failures:', failed);
    } else {
        console.info('Gear regression suite passed:', results.length, 'checks');
    }
})();
