$(document).ready(function () {
	select_interface("skill", 3);
	select_interface("ap", 0);
	select_interface("hit_mod", 0);
	select_interface("hit_sus", "");
	select_interface("hit_crit", 6);
	select_interface("wound_mod", 0);
	select_interface("wound_crit", 6);
	select_interface("save", 4);
	select_interface("save_mod", 0);
	select_interface("invulnerable", "");
	select_interface("fnp", "");
	dice_interface("damage");
	dice_interface("attack");
});

function select_interface(attribute, val) {

	$(".select_" + attribute).removeClass("btn-primary");
	$(".select_" + attribute).addClass("btn-secondary");
	$("#select_" + attribute + "_" + val).removeClass("btn-secondary");
	$("#select_" + attribute + "_" + val).addClass("btn-primary");
	
	if (attribute == "skill") {
		$("#bs").val(val);
	} else if (attribute == "strength") {
		$("#s").val(val);
	} else if (attribute == "ap") {
		$("#ap").val(val);
	} else if (attribute == "hit_mod") {
		$("#hit_mod").val(val);
	} else if (attribute == "hit_sus") {
		$("#hit_sus").val(val);
	} else if (attribute == "hit_crit") {
		$("#hit_crit").val(val);
	} else if (attribute == "wound_mod") {
		$("#wound_mod").val(val);
	} else if (attribute == "wound_crit") {
		$("#wound_crit").val(val);
	} else if (attribute == "save") {
		$("#save").val(val);
	} else if (attribute == "save_mod") {
		$("#save_mod").val(val);
	} else if (attribute == "invulnerable") {
		$("#invulnerable").val(val);
	} else if (attribute == "fnp") {
		$("#fnp").val(val);
	}
}

function dice_interface(attribute) {

	var dice_count = $("#" + attribute  + "_dice_count").val();
	var dice_type = $("#" + attribute  + "_dice_type").val();
	var flat_count = $("#" + attribute  + "_flat_count").val();

	var val = "";
	if (dice_count != "0" && dice_type != "0") {
		val += dice_count + "d" + dice_type;
	}
	if (flat_count != "0") {
		val += (val == "" ? flat_count : "+" + flat_count);
	}
		
	if (attribute == "attack") {
		$("#attacks").val(val);
	} else if (attribute == "damage") {
		$("#d").val(val);
	}
}

function plusorminus_interface(attribute, increment) {
	
	var val = Number.parseInt($("#" + attribute).val());
	val += increment;
	$("#" + attribute).val(val);	
}
