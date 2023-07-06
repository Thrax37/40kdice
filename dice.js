
function fetch_value(id) {
    var element = document.getElementById(id);
    if (element == null) {
        return null;
    }
    return element.value;
}

function fetch_int_value(id) {
    var value = fetch_value(id);
    return parseInt(value, 10);
}

function is_checked(id) {
    return document.getElementById(id).checked;
}

// Chance that a single die roll will pass.
// Returns an object containing several relevant probabilities.
function success_chance(stat, modifier) {
    var ret = {};

    // No stat means auto-succeed, but nothing special triggers.
    if (isNaN(stat)) {
        ret.pass_chance = 1.0;
        ret.fail_chance = 0.0;
        ret.natural_fail_chance = 0.0;
        ret.six_chance = 0.0;
        return ret;
    }

    if (isNaN(modifier)) {
        modifier = 0;
    }

    // Put stat in sane limits (2-7).
    if (stat < 2) {
        stat = 2;
    } else if (stat > 7) {
        stat = 7;
    }

    // Apply modifier to stat naively.
    var modded_stat = stat - modifier;

    // Put modded stat in sane limits (2-7).
    if (modded_stat < 2) {
        modded_stat = 2;
    } else if (modded_stat > 7) {
        modded_stat = 7;
    }
    ret.pass_chance = (7 - modded_stat) / 6.0;
    ret.fail_chance = 1.0 - ret.pass_chance;

    // Modifiers are applied to the die roll, not the stat.
    // So if you have a -1, both 1 and 2 are treated as a result of 1
    // Similarly, if you have a +1, rolls of 1 and 2 are both treated as a 2.

    // Rerolls, however, only care about the natural values.
    // So a reroll of 1 is always a natural 1 and 'reroll failed' will not
    // give you more rerolls for having taken a penalty.  However, reroll
    // effects are 'may reroll', so you won't be forced to reroll a die that
    // passes due to positive modifiers.

    if (modifier > 0) {
        // Rerolls are optional, so only reroll things that will really fail.
        ret.natural_fail_chance = 1.0 - (7 - modded_stat) / 6.0;

        // Positive modifiers increase 6+ range.
        // Smallest die roll that counts as a result of 6 or more.
        var six_threshold = Math.max(modded_stat, 6 - modifier);
        ret.six_chance = (7 - six_threshold) / 6.0;
    } else if (modifier < 0) {
        // Unmodified fail chance.
        ret.natural_fail_chance = 1.0 - (7 - stat) / 6.0;

        // negative modifiers eliminate results of 6+.
        ret.six_chance = 0.0;
    } else {
        ret.natural_fail_chance = ret.fail_chance;
        ret.six_chance = 1.0 / 6.0;
    }

    return ret;
}

// Reroll 1s
// Returns new success probability struct with updated values.
function reroll_1(prob){
    var ret = {};

    // Natural one happens 1/6 of the time.
    ret.pass_chance = prob.pass_chance + prob.pass_chance / 6.0;
    ret.fail_chance = 1.0 - ret.pass_chance;
    ret.six_chance = prob.six_chance + prob.six_chance / 6.0;

    return ret;
}

// Reroll all failed rolls
// Returns new success probability struct with updated values.
function reroll(prob){
    var ret = {};

    ret.pass_chance = prob.pass_chance + prob.natural_fail_chance * prob.pass_chance;
    ret.fail_chance = 1.0 - ret.pass_chance;
    ret.six_chance = prob.six_chance + prob.natural_fail_chance * prob.six_chance;

    return ret;
}

// Shake off damage
// Returns a prob array reflecting the chance to ignore wounds.
function shake_damage(damage_prob, fnp) {
    var results = [];
    results.length = damage_prob.length;
    results.fill(0.0);
    results[0] = damage_prob[0];

    if (fnp) {
        // Ability to shake off individual points of damage
        if (fnp < 2) {
            fnp = 2;
        }
        if (fnp > 7) {
            fnp = 7;
        }

        var shake_prob = (7.0 - fnp) / 6.0;

        // Must work from left to right since we are moving results down.
        for(var d = 1; d < damage_prob.length; d++) {
            if (damage_prob[d] > 0) {
                // Copy base probability
                results[d] = damage_prob[d];

                // Binomial theorem; chance of shaking off n wounds
                for (var n = 1; n <= d; n++) {
                    var shake_n_prob = prob(d, n, shake_prob);
                    var delta = damage_prob[d] * shake_n_prob;
                    results[d] -= delta;
                    results[d - n] += delta;
                }
            }
        }
    } else {
        // No shake effect
        results = damage_prob;
    }

    return results;
}

function rolls_of_6_as_mortal(rolls, six_chance, damage_prob) {
    var results = {'normal': [], 'mortal': []};

    // Calculate base probability of a given number of mortal wounds.
    for (var w = 0; w < rolls.normal.length; w++) {
        // Wound of 6+ deals all damage as mortal wounds
        // Use binomial theorem to find out how likely it is to get n sixes on w dice.
        for (var n = 0; n <= w; n++) {
            var n_six_prob = prob(w, n, six_chance);
            console.log('[' + w + '][' + n + '] Chance of ' + n + ' mortal(s): ' + n_six_prob);

            if (results.normal[w - n] == null) {
                results.normal[w - n] = 0;
                results.mortal[w - n] = [0];
            }
            results.normal[w - n] += rolls.normal[w] * n_six_prob;

            for (var m = 0; m < rolls.mortal[w].length; m++) {
                if (results.mortal[w - n][m] == null) {
                    results.mortal[w - n][m] = 0;
                }
                // Distribute existing mortals across the target column.
                results.mortal[w - n][m] += rolls.mortal[w][m] * n_six_prob;

                // Add new mortals targeting the column with reduced hits.
                var damage = roll_n_dice(n, damage_prob);
                for (var d = 1; d < damage.length; d++) {
                    if (results.mortal[w - n][m + d] == null) {
                        results.mortal[w - n][m + d] = 0;
                    }
                    results.mortal[w - n][m] -= rolls.normal[w] * n_six_prob * damage[d];
                    results.mortal[w - n][m + d] += rolls.normal[w] * n_six_prob * damage[d];
                }
            }
        }
    }

    return results;
}

function rolls_of_6_add_mortal(rolls, six_chance) {
    for (var w = 0; w < rolls.normal.length; w++) {
        // Roll of 6+ deals 1 mortal wound in addition to normal wounds
        // Use binomial theorem to find out how likely it is to get n sixes on w dice.
        for (var n = 0; n <= w; n++) {
            var n_six_prob = prob(w, n, six_chance);

            if (rolls.mortal[w][n] == null) {
                rolls.mortal[w][n] = 0;
            }
            // XXX iterate over previous values, not always from 0
            rolls.mortal[w][n] += n_six_prob;
            rolls.mortal[w][0] -= n_six_prob;
        }
    }
}

function do_hits(hit_stat, hit_mod, hit_reroll, attacks, hit_abilities, damage_prob, hit_prob) {
    var hit_title;
    if (hit_prob.pass_chance == 1) {
        hit_title = 'auto-hit';
    } else {
        hit_title = 'hit on ' + hit_stat + '+';

        if (hit_mod) {
            var sign = '';
            if (hit_mod > 0) {
                sign = '+';
            }
            hit_title += ' (' + sign + hit_mod + ')';
        }
    }

    // Rerolls
    if (hit_reroll == 'fail') {
        hit_title += ', reroll misses';
        hit_prob = reroll(hit_prob);
    } else if (hit_reroll == '1') {
        hit_title += ', reroll 1s';
        hit_prob = reroll_1(hit_prob);
    }

    log_prob_array('Attacks', attacks);

    // Apply probability filter
    var hits = filter_prob_array(attacks, hit_prob.pass_chance);
    var base_hits = filter_prob_array(attacks, hit_prob.pass_chance);
    var hit_six_chance = hit_prob.six_chance / hit_prob.pass_chance;
    log_prob_array('Hits', hits);

    // Hits of six mortal wound effects
    // Apply these independently of generating additional hits
    if (hit_abilities['mortal']) {
        console.log('Mortals on hit rolls of 6');
        hits = rolls_of_6_as_mortal(hits, hit_six_chance, damage_prob);
    } else if (hit_abilities['+mortal']) {
        rolls_of_6_add_mortal(hits, hit_six_chance);
    }

    // Hit of six generates extra hits
    if (hit_abilities['+hit'] || hit_abilities['+roll']) {
        // Probability of a six given that we hit.
        var bonus_hits = 0;
        var bonus_hit_prob = 0;

        if (hit_abilities['+hit']) {
            bonus_hits = hit_abilities['+hit'];
            hit_title += ', 6s extra ' + bonus_hits + ' extra hit(s)';
            bonus_hit_prob = 1.0;
        } else if (hit_abilities['+roll']) {
            bonus_hits = hit_abilities['+roll'];
            hit_title += ', 6s add ' + bonus_hits + ' hit roll(s)';
            bonus_hit_prob = hit_prob.pass_chance;
        }

        // Take hits from each column and move them to the right.
        // Have to start from the top, or we'll apply to hits we already shifted up.
        // Use the base hit numbers before converting hits of 6 to mortals.
        // Also don't apply to misses.
        for (var h = base_hits.normal.length - 1; h > 0; h--) {
            if (base_hits.normal[h] > 0) {
                // We may decrement this multiple times.  Need to keep the original reference.
                var original_h_prob = base_hits.normal[h];

                // Use binomial theorem to find out how likely it is to get n sixes on h dice.
                for (var n = 1; n <= h; n++) {
                    var n_six_hit_prob = prob(h, n, hit_six_chance);

                    // Binomial again to see how many of the bonus hits hit.
                    for (var b = 1; b <= bonus_hits * n; b++) {
                        var b_prob = prob(bonus_hits * n, b, bonus_hit_prob);
                        if (b_prob) {
                            var target = h + b;
                            var six_delta = original_h_prob * n_six_hit_prob * b_prob;
                            hits.normal[h] -= six_delta;
                            if (hits.normal[target] == null) {
                                hits.normal[target] = 0;
                            }
                            hits.normal[target] += six_delta;
                        }
                    }
                }
            }
        }
    }

    // Add in any mortal wounds caused by critical hits

    log_prob_array('Final Hits', hits);

    graph(hits, hit_title, 'hit');

    return hits;
}

function calc_wound_prob(wound_stat, wound_mod, wound_reroll, hit_abilities, hit_prob) {
    var wound_prob = success_chance(wound_stat, wound_mod);

    // Rerolls
    if (wound_reroll == 'fail') {
        wound_prob = reroll(wound_prob);
    } else if (wound_reroll == '1') {
        wound_prob = reroll_1(wound_prob);
    }

    // Auto-wound on roll of 6+
    // Only apply normal wound probability to lesser hits
    if (hit_abilities['autowound']) {
        var hit_six_chance = hit_prob.six_chance / hit_prob.pass_chance;
        wound_prob.pass_chance = 1.0 * hit_six_chance + wound_prob.pass_chance * (1.0 - hit_six_chance);
        wound_prob.fail_chance = wound_prob.fail_chance * (1.0 - hit_six_chance);
        wound_prob.natural_fail_chance = wound_prob.natural_fail_chance * (1.0 - hit_six_chance);
        wound_prob.six_chance = wound_prob.six_chance * (1.0 - hit_six_chance);
    }

    return wound_prob;
}

function do_wounds(wound_stat, wound_mod, wound_reroll, wound_prob, hits, wound_abilities, damage_prob) {
    var wound_title;
    if (wound_prob.pass_chance == 1) {
        wound_title = 'auto-wound';
    } else {
        wound_title = 'wound on ' + wound_stat + '+';
    }

    // Rerolls
    if (wound_reroll == 'fail') {
        wound_title += ', reroll failed';
    } else if (wound_reroll == '1') {
        wound_title += ', reroll 1s';
    }

    // Apply probability filter
    var wounds = filter_prob_array(hits, wound_prob.pass_chance);
    log_prob_array('Wounds', wounds);

    // Calculate odds of getting mortal wounds.
    // Is a set of probability arrays keyed on the number of wounds.
    // Probability of a six given that we wound.
    var wound_six_chance = wound_prob.six_chance / wound_prob.pass_chance;
    if (wound_abilities['+mortal']) {
        rolls_of_6_add_mortal(wounds, wound_six_chance);
    } else if (wound_abilities['mortal']) {
        console.log('Mortals on wound rolls of 6');
        wounds = rolls_of_6_as_mortal(wounds, wound_six_chance, damage_prob);
    }

    log_prob_array('Final Wounds', wounds);

    graph(wounds, wound_title, 'wound');

    return wounds;
}

function do_saves(save_stat, invuln_stat, ap_val, save_mod, cover, save_reroll, wound_abilities, wounds, wound_prob) {
    // Always treat AP as negative
    ap_val = -Math.abs(ap_val);
    if (isNaN(save_mod)) {
        save_mod = 0;
    }
    if (isNaN(ap_val)) {
        ap_val = 0;
    }
    var total_save_mod = save_mod + ap_val;
    if (cover) {
        total_save_mod++;
    }
    var use_invuln = false;

    // Auto-fail the save if no save stat given.
    if (isNaN(save_stat)) {
        save_stat = 100;
    }
    if (isNaN(invuln_stat) || invuln_stat == null) {
        invuln_stat = 100;
    }

    // Normal save.
    var save_prob = success_chance(save_stat, total_save_mod);
    var save_title = 'save of ' + save_stat + '+';
    if (total_save_mod) {
        var sign = '';
        if (total_save_mod > 0) {
            sign = '+';
        }
        save_title += ' (' + sign + total_save_mod + ')';
    }
    if (save_reroll == 'fail') {
        save_title += ', reroll failures';
        save_prob = reroll(save_prob);
    } else if (save_reroll == '1') {
        save_title += ', reroll 1s';
        save_prob = reroll_1(save_prob);
    }

    // Invulnerable save; ignores AP and cover, but includes other modifiers.
    var invuln_prob = success_chance(invuln_stat, save_mod);
    var invuln_title = 'save of ' + invuln_stat + '++';
    if (save_mod) {
        var sign = '';
        if (save_mod > 0) {
            sign = '+';
        }
        invuln_title += ' (' + sign + save_mod + ')';
    }
    if (save_reroll == 'inv_fail') {
        invuln_title += ', reroll failures';
        invuln_prob = reroll(invuln_prob);
    } else if (save_reroll == 'inv_1') {
        invuln_title += ', reroll 1s';
        invuln_prob = reroll_1(invuln_prob);
    }

    // wounds of 6 get additional AP
    if (wound_abilities['pierce']) {
        // Probability of a six given that we wound.
        var wound_six_chance = wound_prob.six_chance / wound_prob.pass_chance;
        var ap_mod = parseInt(wound_abilities['pierce'], 10);

        // calculate save chance with modified AP.
        var ap_save_prob = success_chance(save_stat, total_save_mod - ap_mod);
        if (save_reroll == 'fail') {
            ap_save_prob = reroll(ap_save_prob);
        } else if (save_reroll == '1') {
            ap_save_prob = reroll_1(ap_save_prob);
        }

        // But don't use it if it's worse than the invulnerable save.
        if (invuln_prob.pass_chance > ap_save_prob.pass_chance) {
            ap_save_prob = invuln_prob;
        }

        // Set the save chance as a weighted combination of normal hits
        // and AP-X hits.
        // 1 chance and 6 chance are no longer accurate.
        save_prob.pass_chance = wound_six_chance * ap_save_prob.pass_chance + (1 - wound_six_chance) * save_prob.pass_chance;
        save_prob.fail_chance = wound_six_chance * ap_save_prob.fail_chance + (1 - wound_six_chance) * save_prob.fail_chance;
    }

    // Use whichever save is better.  Includes rerolls.
    var unsaved_prob;
    var unsaved_title;
    if (invuln_prob.pass_chance > save_prob.pass_chance) {
        unsaved_prob = invuln_prob.fail_chance;
        unsaved_title = invuln_title;
    } else {
        unsaved_prob = save_prob.fail_chance;
        unsaved_title = save_title;
    }

    var unsaved;
    unsaved = filter_prob_array(wounds, unsaved_prob);

    if (unsaved_prob == 1) {
        unsaved_title = 'auto-fail save';
    }

    graph(unsaved, unsaved_title, 'unsaved');
    return unsaved;
}

function do_damage(damage_val, fnp, damage_prob, unsaved) {
    var damage_title = damage_val + ' damage';
    if (fnp) {
        damage_title += ' (shake on ' + fnp + '+)';
    }

    damage_prob = shake_damage(damage_prob, fnp);

    // Change of a mortal wound going through.
    var mortal_damage_chance = shake_damage([0, 1], fnp)[1];

    var damage = {'normal': []};
    // Apply damage based on how many hits there are.
    for(var n = 0; n < unsaved.normal.length; n++) {
        // Generate damage array for this many impacts.
        hit_damage = roll_n_dice(n, damage_prob);

        // Add to the damage output, scaled by our current probability.
        for (var d = 0; d < hit_damage.length; d++) {
            // Add extra damage points for mortal wounds.
            for (var m = 0; m < unsaved.mortal[n].length; m++) {
                for (var mortals = 0; mortals <= m; mortals++) {
                    var n_mortal_prob = prob(m, mortals, mortal_damage_chance);

                    // Total damage including mortal wounds
                    var dam = d + mortals;

                    if (damage.normal[dam] == null) {
                        damage.normal[dam] = 0;
                    }
                    damage.normal[dam] += hit_damage[d] * unsaved.mortal[n][m] * n_mortal_prob;
                }
            }
        }
    }

    graph(damage, damage_title, 'damage');
    return damage;
}

function do_killed_40k(damage_prob, fnp, unsaved, wound_val) {
    var killed = {'normal': []};
    var killed_title = 'models killed';
    damage_prob = shake_damage(damage_prob, fnp);
    var mortal_damage_chance = shake_damage([0, 1], fnp)[1];
    if (wound_val) {
        for(var n = 0; n < unsaved.normal.length; n++) {
            // Generate killed array for this many impacts.
            hit_killed = roll_n_dice_against_threshold(n, damage_prob, wound_val);

            // Add to the killed output, scaled by our current probability.
            for (var k = 0; k < hit_killed.length; k++) {
                for (var w = 0; w < hit_killed[k].length; w++) {
                    // Add extra kills for mortal wounds.
                    for (var m = 0; m < unsaved.mortal[n].length; m++) {
                        for (var mortals = 0; mortals <= m; mortals++) {
                            var n_mortal_prob = prob(m, mortals, mortal_damage_chance);

                            // Total kills; previously killed models + mortal wounds.
                            var kills = k + Math.floor((w + mortals) / wound_val);

                            if (killed.normal[kills] == null) {
                                killed.normal[kills] = 0;
                            }
                            killed.normal[kills] += hit_killed[k][w] * unsaved.mortal[n][m] * n_mortal_prob;
                        }
                    }
                }
            }
        }
    }

    graph(killed, killed_title, 'killed');
    return killed;
}

function do_killed_aos(damage, wound_val) {
    var killed = {'normal': []};
    var killed_title = 'models killed';
    if (wound_val) {
        for(var n = 0; n < damage.normal.length; n++) {
            var kills = Math.floor(n / wound_val);
            if (killed.normal[kills] == null) {
                killed.normal[kills] = 0;
            }
            killed.normal[kills] += damage.normal[n];
        }
    }

    graph(killed, killed_title, 'killed');
    return killed;
}

function roll_40k() {
    // Fetch all values up front
    var hit_dice = fetch_value('attacks');
    var hit_stat = fetch_int_value('bs');
    var hit_mod = fetch_int_value('hit_mod');
    var hit_reroll = fetch_value('hit_reroll');
    var hit_leth = is_checked('hit_leth');
    var hit_sus = fetch_int_value('hit_sus');
    var s = fetch_int_value('s');
    var t = fetch_int_value('t');
    var wound_mod = fetch_int_value('wound_mod');
    var wound_reroll = fetch_value('wound_reroll');
    var wound_dev = is_checked('wound_dev');
    var wound_crit = fetch_int_value('wound_crit');
    var save_stat = fetch_int_value('save');
    var invuln_stat = fetch_int_value('invulnerable');
    var ap_val = fetch_int_value('ap');
    var save_mod = fetch_int_value('save_mod');
    var cover = is_checked('cover');
    var save_reroll = fetch_value('save_reroll');
    var damage_val = fetch_value('d');
    var wound_val = fetch_int_value('wounds');
    var fnp = fetch_int_value('fnp');

    var damage_prob = dice_sum_prob_array(damage_val).normal;

    // Number of attacks
    var attacks = dice_sum_prob_array(hit_dice);
    var attack_title = hit_dice + ' attacks';

    graph(attacks, attack_title, 'attack');

    // Hits
    var hit_prob = success_chance(hit_stat, hit_mod);
    var hit_abilities = {
        '+hit': hit_sus,
        'autowound': hit_leth
    };
    var hits = do_hits(hit_stat, hit_mod, hit_reroll, attacks, hit_abilities, damage_prob, hit_prob);

    // Wounds
    var wound_stat;
    if (!s || !t) {
        wound_stat = Number.NaN;
    } else if (t >= s * 2) {
        wound_stat = 6;
    } else if (t > s) {
        wound_stat = 5;
    } else if (s >= t * 2) {
        wound_stat = 2;
    } else if (s > t) {
        wound_stat = 3;
    } else {
        wound_stat = 4;
    }
    var wound_abilities = {
        'mortal': wound_dev
    }
    var wound_prob = calc_wound_prob(wound_stat, wound_mod, wound_reroll, hit_abilities, hit_prob);
    var wounds = do_wounds(wound_stat, wound_mod, wound_reroll, wound_prob, hits, wound_abilities, damage_prob);

    // Saves
    var unsaved = do_saves(save_stat, invuln_stat, ap_val, save_mod, cover, save_reroll, wound_abilities, wounds, wound_prob);

    // Damage
    var damage = do_damage(damage_val, fnp, damage_prob, unsaved);

    // Models Killed
    var killed = do_killed_40k(damage_prob, fnp, unsaved, wound_val);

    generate_permalink_40k();
}

function roll_aos() {
    // Fetch all values up front
    var hit_dice = fetch_value('attacks');
    var hit_stat = fetch_int_value('hit');
    var hit_mod = fetch_int_value('hit_mod');
    var hit_reroll = fetch_value('hit_reroll');
    var hit_of_6 = fetch_value('hit_of_6');
    var wound_stat = fetch_int_value('wound');
    var wound_mod = fetch_int_value('wound_mod');
    var wound_reroll = fetch_value('wound_reroll');
    var wound_of_6 = fetch_value('wound_of_6');
    var save_stat = fetch_int_value('save');
    var rend_val = fetch_int_value('rend');
    var save_mod = fetch_int_value('save_mod');
    var cover = is_checked('cover');
    var save_reroll = fetch_value('save_reroll');
    var damage_val = fetch_value('d');
    var wound_val = fetch_int_value('wounds');
    var shake = fetch_value('shake');

    var damage_prob = dice_sum_prob_array(damage_val).normal;

    // Number of attacks
    var attacks = dice_sum_prob_array(hit_dice);
    var attack_title = hit_dice + ' attacks';

    graph(attacks, attack_title, 'attack');

    // Hits
    var hit_prob = success_chance(hit_stat, hit_mod);
    var hit_abilities = {};
    if (hit_of_6 == '1') {
        hit_abilities['+hit'] = 1;
    } else if (hit_of_6 == '2') {
        hit_abilities['+hit'] = 2;
    } else if (hit_of_6 == '1roll') {
        hit_abilities['+roll'] = 1;
    }
    hit_abilities['autowound'] = (hit_of_6 == 'autowound');
    hit_abilities['+mortal'] = (hit_of_6 == '+mortal');
    hit_abilities['mortal'] = (hit_of_6 == 'mortal');
    var hits = do_hits(hit_stat, hit_mod, hit_reroll, attacks, hit_abilities, damage_prob, hit_prob);

    // Wounds
    var wound_prob = calc_wound_prob(wound_stat, wound_mod, wound_reroll, hit_abilities, hit_prob);
    var wound_abilities = {};
    if (wound_of_6 == '-1') {
        wound_abilities['pierce'] = 1;
    } else if (wound_of_6 == '-3') {
        wound_abilities['pierce'] = 3;
    } else if (wound_of_6 == '-4') {
        wound_abilities['pierce'] = 4;
    }
    wound_abilities['+mortal'] = (wound_of_6 == '+mortal');
    wound_abilities['mortal'] = (wound_of_6 == 'mortal');
    var wounds = do_wounds(wound_stat, wound_mod, wound_reroll, wound_prob, hits, wound_abilities, damage_prob);

    // Saves
    var unsaved = do_saves(save_stat, null, rend_val, save_mod, cover, save_reroll, wound_abilities, wounds, wound_prob);

    // Damage
    var ward;
    if (shake == '6') {
        ward = 6;
    } else if (shake == '56') {
        ward = 5;
    }
    var damage = do_damage(damage_val, ward, damage_prob, unsaved);

    // Models Killed
    var killed = do_killed_aos(damage, wound_val);

    generate_permalink_aos();
}

// Binomial expansion.
function binom(n, k) {
    // n! / (k! * (n - k)!)

    // In order to avoid floating point over/under-flow, I need to intersperse
    // the operations.  This is less computationally efficient, since I'll do
    // a lot more floating point division, but it will help ensure that neither
    // the numerator nor denominator goes to "infinity".

    // Numerator is what is left after canceling out n! / (n - k)!
    // So (n - k + 1) * (n - k + 2) * ... * (n - 1) * n
    var numerator = [];
    for (var i = n - k + 1; i <= n; i++) {
        numerator[numerator.length] = i;
    }

    // Denominator is k!
    var denominator = [];
    for (var j = 2; j <= k; j++) {
        denominator[denominator.length] = j;
    }

    var result = 1.0;
    var length = Math.max(numerator.length, denominator.length);
    for (var i = 0; i < length; i++) {
        if (i < numerator.length) {
            result *= numerator[i];
        }
        if (i < denominator.length) {
            result /= denominator[i];
        }
    }

    return result;
}

// Probability of successes given a number of trials and a probability.
function prob(trials, successes, probability) {
    return binom(trials, successes) * Math.pow(probability, successes) * Math.pow(1 - probability, trials - successes);
}

// Takes a probability array, returns new probability array reduced by the
// specified probability of success.
function filter_prob_array(input_probs, probability) {
    var results = {'normal': [], 'mortal': []};

    for(var i = 0; i < input_probs.normal.length; i++) {
        // merge into master list based on how likely this many trials were
        for(var r = 0; r <= i; r++) {
            var trial_result = prob(i, r, probability);

            if (results.normal[r] == null) {
                results.normal[r] = 0;
                results.mortal[r] = [0];
            }
            results.normal[r] += input_probs.normal[i] * trial_result;

            // Any mortals that are here need to be distributed over the entire mortal distribution at the target
            if (input_probs.mortal[i]) {
                for (var m = 0; m < input_probs.mortal[i].length; m++) {
                    if (results.mortal[r][m] == null) {
                        results.mortal[r][m] = 0;
                    }
                    results.mortal[r][m] += input_probs.mortal[i][m] * trial_result;
                }
            }
        }
    }

    return results;
}

// Returns a probability array for a specified number of dice in nDs notation.
// Will also return a constant probability array if no 'd' is present.
function dice_sum_prob_array(value) {
    var die_prob = {'normal': [], 'mortal': []};
    var i = value.toLowerCase().indexOf('d');
    // No 'd', return constant probability.
    if (i == -1) {
        die_prob.normal.length = value;
        die_prob.mortal.length = value;
        for (var n = 0; n < die_prob.normal.length; n++) {
            die_prob.normal[n] = 0;
            die_prob.mortal[n] = [0];
        }
        die_prob.normal[die_prob.normal.length] = 1;
        die_prob.mortal[die_prob.mortal.length] = [1];
        return die_prob;
    }
    var n = parseInt(value.substring(0, i), 10);
    if (isNaN(n) || n <= 0) {
        n = 1;
    }
    var sides = parseInt(value.substring(i + 1), 10);
    if (isNaN(sides) || sides <= 0) {
        sides = 1;
    }

    var die_faces = [];
    die_faces[0] = 0;
    for (var i = 1; i <= sides; i++) {
        die_faces[i] = 1.0 / sides;
    }

    die_prob.normal = roll_n_dice(n, die_faces);
    for (var w = 0; w < die_prob.normal.length; w++) {
        die_prob.mortal[w][0] = die_prob.normal[w];
    }
    return die_prob;
}

// Roll n dice with the given probability distribution.
// http://ghostlords.com/2008/03/dice-rolling-2/
// Modified to support dice with non-uniform probabilities.
// Note that this includes dice that can roll a result of 0!
function roll_n_dice(n, die_prob) {
    // If we're rolling 0 dice, 100% chance of getting 0
    if (n <= 0) {
        return [1];
    }

    // Make a pair of buffers.  Preload the values for 1 die in each.
    // We only enter the loop for 2+ dice.
    var probs = [];
    var oldprobs = [];
    var sides = die_prob.length - 1;
    probs.length = n * sides + 1;
    oldprobs.length = n * sides + 1;
    probs.fill(0);
    oldprobs.fill(0);
    for (var i = 0; i <= sides; i++) {
        probs[i] = die_prob[i];
        oldprobs[i] = die_prob[i];
    }

    for (var d = 2; d <= n; d++) {
        // Clear working buffer
        probs = [];
        probs.length = n * sides + 1;
        probs.fill(0);

        // For each face of the new die...
        for (var i = 0; i <= sides; i++) {
            // Sum with old outcomes...
            for (var j = 0; j <= (d - 1) * sides; j++) {
                // Combine probabilities of [i] and [j] to get [i+j]
                probs[i + j] += die_prob[i] * oldprobs[j];
            }
        }
        oldprobs = probs;
    }

    return probs;
}

// Variant of roll_n_dice that checks the total against a threshold.
// Used to efficiently calculate how many models are killed by n attacks.
// Return value is a 2D array:
//   1st index is number of successes (value >= threshold)
//   2nd index is the excess value accumulated
// Total probability for n successes is the sum of return[n]
function roll_n_dice_against_threshold(n, die_prob, threshold) {
    // If we're rolling 0 dice, 100% chance of getting 0
    if (n <= 0) {
        return [[1]];
    }

    // Make a pair of buffers.  Preload the values for 1 die in each.
    // We only enter the loop for 2+ dice.
    var sides = die_prob.length - 1;
    var probs = array_2d(2, threshold);
    var oldprobs = array_2d(2, threshold);
    for (var i = 0; i <= sides; i++) {
        if (i >= threshold) {
            probs[1][0] += die_prob[i];
            oldprobs[1][0] += die_prob[i];
        } else {
            probs[0][i] = die_prob[i];
            oldprobs[0][i] = die_prob[i];
        }
    }

    for (var d = 2; d <= n; d++) {
        // Clear working buffer
        probs = array_2d(d + 1, threshold);

        // For each face of the new die...
        for (var i = 0; i <= sides; i++) {
            // Sum with old outcomes...
            for (var s = 0; s < oldprobs.length; s++) {
                for (var v = 0; v < oldprobs[s].length; v++) {
                    // Calculate new number of partial/complete successes.
                    var value = v + i;
                    var successes = s;
                    if (value >= threshold) {
                        value = 0;
                        successes++;
                    }
                    probs[successes][value] += die_prob[i] * oldprobs[s][v];
                }
            }
        }
        oldprobs = probs;
    }

    return probs;
}

// Logging and validation
function log_prob_array(label, prob) {
    console.log('--- ' + label + ' ---');
    if (prob.mortal && prob.normal.length != prob.mortal.length) {
        console.error('Mismatched lengths: ' + prob.normal.length + ' != ' + prob.mortal.length);
    }

    var normal_sum = 0.0;
    var mortal_sum = 0.0;
    for (var w = 0; w < prob.normal.length; w++) {

        console.log(' ' + w + ' = ' + prob.normal[w]);
        normal_sum += prob.normal[w];

        var mortal_row_sum = 0.0;
        for (var m = 0; m < prob.mortal[w].length; m++) {
            console.log('   ' + w + ':' + m + ' = ' + prob.mortal[w][m]);
            mortal_sum += prob.mortal[w][m];
            mortal_row_sum += prob.mortal[w][m];
        }

        if (Math.abs(prob.normal[w] - mortal_row_sum) > 0.0001) {
            console.error('Mortal row probabilities do not sum to normal probability: ' + mortal_row_sum);
        }

    }

    if (Math.abs(1.0 - normal_sum) > 0.0001) {
        console.error('Normal probabilities do not sum to 1.0: ' + normal_sum);
    }

    if (prob.mortal && Math.abs(1.0 - mortal_sum) > 0.0001) {
        console.error('Mortal probabilities do not sum to 1.0: ' + mortal_sum);
    }

    console.log('--------------');
}

// Returns a 2d array[i][j] where every index is = 0
function array_2d(i, j) {
    var ret = [];
    for (var a = 0; a < i; a++) {
        ret[a] = [];
        ret[a].length = j;
        ret[a].fill(0);
    }
    return ret;
}

function expected_value(data) {
    var ev = 0.0;
    for(var i = 0; i < data.length; i++) {
        if (data[i]) {
            ev += i * data[i];
        }
    }

    return ev;
}

function graph(raw_data, title, chart_name) {
    var labels = [];
    var cumulative_data = [];
    var cumulative = 100.0;
    var data = [];
    var mortal = [];
    var chart = charts[chart_name];

    // Clean up data for graphing.
    var max_length = raw_data.normal.length;
    for(var l = 0; l < max_length; l++) {
        if (raw_data.normal[l] == null) {
            raw_data.normal[l] = 0.0;
        }
        // Generate rounded percentage point values.
        var clean = Math.round(raw_data.normal[l] * 1000) / 10.0;

        data[l] = clean;
        labels[l] = l;
        if (l == 0 || clean) {
            cumulative_data.push({x: l, y: Math.round(cumulative * 10) / 10.0});
        }

        // Decrement cumulative probability.
        // Note that this uses the true value, not the cleaned value.
        if (raw_data.normal[l] != null) {
            cumulative -= raw_data.normal[l] * 100;
        }

        // Mortal wounds are second dimenion and have to be summed across all rows
        if (raw_data.mortal && raw_data.mortal[l]) {
            if (raw_data.mortal[l].length > max_length) {
                max_length = raw_data.mortal[l].length;
            }
            for(var m = 0; m < raw_data.mortal[l].length; m++) {
                if (mortal[m] == null) {
                    mortal[m] = 0.0;
                }
                mortal[m] += raw_data.mortal[l][m];
            }
        }
    }

    // Turn mortal count into percentage points
    //chart.options.scales.xAxes[AXIS_LABELS].categoryPercentage = 1.6
    if (mortal.length <= 1) {
        mortal = [];
    } else {
        for (var m = 0; m < mortal.length; m++) {
            mortal[m] = Math.round(mortal[m] * 1000) / 10.0;
        }
    }

    // Drop zeroes off the end
    var max_length = Math.max(data.length, mortal.length);
    while (max_length && (!data[max_length - 1] && !mortal[max_length - 1])) {
        max_length--;
        data.length = max_length;
        mortal.length = max_length;
        labels.length = max_length;
        if (cumulative_data[cumulative_data.length - 1].x >= max_length) {
            cumulative_data.length--;
        }
    }
    cumulative_data.push({x: max_length, y: 0});

    // Expected values
    var text = document.getElementById(chart_name + '_text');
    var ev = expected_value(raw_data.normal);
    ev = Math.round(ev * 100) / 100.0;
    text.innerHTML = 'Expected: ' + ev;
    var ev_points = [{x:ev, y:0}, {x:ev, y:100}];

    chart.data.datasets[DATASET_PRIMARY].data = data;
    chart.data.datasets[DATASET_MORTAL].data = mortal;
    chart.data.datasets[DATASET_CUMULATIVE].data = cumulative_data;
    chart.data.datasets[DATASET_EXPECTED].data = ev_points;
    chart.data.labels = labels;
    chart.options.title.text = title;
    chart.options.scales.xAxes[AXIS_LINEAR].ticks.max = data.length;
    chart.update();
}

var charts = [];


// 40K Init
var fields_40k = ['attacks', 'bs', 'ap', 's', 'd', 't', 'save', 'hit_mod', 'wound_mod', 'save_mod', 'invulnerable', 'wounds', 'hit_sus', 'wound_crit', 'fnp'];
var checkboxes_40k = ['cover', 'hit_leth', 'wound_dev'];
var selects_40k = ['hit_reroll', 'wound_reroll', 'save_reroll'];
function init_40k() {
    charts['attack'] = init_chart('attack_chart', '{n} attacks: ', '>= {n} attacks: ', 'expected: {n} attacks');
    charts['hit'] = init_chart('hit_chart', '{n} hits: ', '>= {n} hits: ', 'expected: {n} hits');
    charts['wound'] = init_chart('wound_chart', '{n} wounds: ', '>= {n} wounds: ', 'expected: {n} wounds');
    charts['unsaved'] = init_chart('unsaved_chart', '{n} unsaved: ', '>= {n} unsaved: ', 'expected: {n} unsaved');
    charts['damage'] = init_chart('damage_chart', '{n} damage: ', '>= {n} damage: ', 'expected: {n} damage');
    charts['killed'] = init_chart('killed_chart', '{n} killed: ', '>= {n} killed: ', 'expected: {n} killed');

    // Populate fields from the parameter string.
    var params = location.hash.substring(1);
    if (params) {
        var pairs = params.split('&');
        if (pairs.length) {
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].split('=');
                var key = decodeURIComponent(pair[0]);
                var value = decodeURIComponent(pair[1]);
                if (fields_40k.indexOf(key) > -1) {
                    document.getElementById(key).value = value;
                } else if (checkboxes_40k.indexOf(key) > -1) {
                    document.getElementById(key).checked = true;
                } else if (selects_40k.indexOf(key) > -1) {
                    document.getElementById(key).value = value;
                }
            }
            roll_40k();
        }
    }
}

function generate_permalink_40k() {
    var pairs = [];
    for(var i = 0; i < fields_40k.length; i++) {
        if (document.getElementById(fields_40k[i]).value) {
            pairs[pairs.length] = fields_40k[i] + '=' + document.getElementById(fields_40k[i]).value;
        }
    }
    for(var i = 0; i < checkboxes_40k.length; i++) {
        if (document.getElementById(checkboxes_40k[i]).checked) {
            pairs[pairs.length] = checkboxes_40k[i];
        }
    }
    for(var i = 0; i < selects_40k.length; i++) {
        if (document.getElementById(selects_40k[i]).value) {
            pairs[pairs.length] = selects_40k[i] + '=' + document.getElementById(selects_40k[i]).value;;
        }
    }
    var query = pairs.join('&');
    location.hash = query;
}

// AoS Init
var fields_aos = ['attacks', 'hit', 'rend', 'wound', 'd', 'save', 'hit_mod', 'wound_mod', 'save_mod', 'wounds'];
var checkboxes_aos = ['cover'];
var selects_aos = ['hit_of_6', 'hit_reroll', 'wound_of_6', 'wound_reroll', 'save_reroll', 'shake'];
function init_aos() {
    charts['attack'] = init_chart('attack_chart', '{n} attacks: ', '>= {n} attacks: ', 'expected: {n} attacks');
    charts['hit'] = init_chart('hit_chart', '{n} hits: ', '>= {n} hits: ', 'expected: {n} hits');
    charts['wound'] = init_chart('wound_chart', '{n} wounds: ', '>= {n} wounds: ', 'expected: {n} wounds');
    charts['unsaved'] = init_chart('unsaved_chart', '{n} unsaved: ', '>= {n} unsaved: ', 'expected: {n} unsaved');
    charts['damage'] = init_chart('damage_chart', '{n} damage: ', '>= {n} damage: ', 'expected: {n} damage');
    charts['killed'] = init_chart('killed_chart', '{n} killed: ', '>= {n} killed: ', 'expected: {n} killed');

    // Populate fields from the parameter string.
    var params = location.hash.substring(1);
    if (params) {
        var pairs = params.split('&');
        if (pairs.length) {
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].split('=');
                var key = decodeURIComponent(pair[0]);
                var value = decodeURIComponent(pair[1]);
                if (fields_aos.indexOf(key) > -1) {
                    document.getElementById(key).value = value;
                } else if (checkboxes_aos.indexOf(key) > -1) {
                    document.getElementById(key).checked = true;
                } else if (selects_aos.indexOf(key) > -1) {
                    document.getElementById(key).value = value;
                }
            }
            roll_aos();
        }
    }
}

function generate_permalink_aos() {
    var pairs = [];
    for(var i = 0; i < fields_aos.length; i++) {
        if (document.getElementById(fields_aos[i]).value) {
            pairs[pairs.length] = fields_aos[i] + '=' + document.getElementById(fields_aos[i]).value;
        }
    }
    for(var i = 0; i < checkboxes_aos.length; i++) {
        if (document.getElementById(checkboxes_aos[i]).checked) {
            pairs[pairs.length] = checkboxes_aos[i];
        }
    }
    for(var i = 0; i < selects_aos.length; i++) {
        if (document.getElementById(selects_aos[i]).value) {
            pairs[pairs.length] = selects_aos[i] + '=' + document.getElementById(selects_aos[i]).value;;
        }
    }
    var query = pairs.join('&');
    location.hash = query;
}

// Shared Init
function init_chart(chart_name, bar_label, line_label, ev_label) {
    var ctx = document.getElementById(chart_name);
    var mortal_label = '{n} mortal: ';

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: bar_label,
                    xAxisID: 'labels',
                    borderColor: 'rgba(128, 0, 128, 0.4)',
                    backgroundColor: 'rgba(128, 0, 128, 0.4)',
                    data: [],
                    stack: 'a'
                }, {
                    label: mortal_label,
                    xAxisID: 'labels',
                    borderColor: 'rgba(192, 0, 0, 0.4)',
                    backgroundColor: 'rgba(192, 0, 0, 0.4)',
                    data: [],
                    stack: 'a'
                }, {
                    label: line_label,
                    xAxisID: 'linear',
                    borderColor: 'rgba(0, 128, 128, 0.4)',
                    backgroundColor: 'rgba(0, 128, 128, 0.2)',
                    pointBackgroundColor: 'rgba(0, 128, 128, 0.4)',
                    data: [],
                    type: 'line',
                    cubicInterpolationMode: 'monotone'
                }, {
                    label: ev_label,
                    xAxisID: 'linear',
                    borderColor: 'rgba(128, 64, 0, 0.4)',
                    backgroundColor: 'rgba(128, 64, 0, 0.4)',
                    pointBackgroundColor: 'rgba(128, 64, 0, 0.4)',
                    data: [],
                    type: 'line'
                }
            ]
        },
        options: {
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        min: 0
                    }
                }],
                xAxes: [
                    {
                        id: 'labels',
                        ticks: {
                            maxRotation: 0
                        },
                        stacked: true
                    },
                    {
                        id: 'linear',
                        type: 'linear',
                        display: false,
                        ticks: {
                            min: 0
                        }
                    }
                ]
            },
            title: {
                display: true
            },
            legend: {
                display: false
            },
            tooltips: {
                callbacks: {
                    title: function(itemArray, chart) {
                        return '';
                    },
                    label: function(item, chart) {
                        if (item.datasetIndex == DATASET_EXPECTED) {
                            // Expected value
                            return chart.datasets[item.datasetIndex].label.replace('{n}', item.xLabel);
                        } else {
                            return chart.datasets[item.datasetIndex].label.replace('{n}', item.xLabel) + item.yLabel + '%';
                        }
                    }
                }
            }
        }
    });
}

// Constants correspond to the chart definitions above.
const DATASET_PRIMARY = 0;
const DATASET_MORTAL = 1;
const DATASET_CUMULATIVE = 2;
const DATASET_EXPECTED = 3;

const AXIS_LABELS = 0;
const AXIS_LINEAR = 1;
