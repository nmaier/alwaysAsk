/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Restartless.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

/**
 * Get a localized string with string replacement arguments filled in and
 * correct plural form picked if necessary.
 *
 * @note: Initialize the strings to use with getString.init(addon).
 *
 * @usage getString(name): Get the localized string for the given name.
 * @param [string] name: Corresponding string name in the properties file.
 * @return [string]: Localized string for the string name.
 *
 * @usage getString(name, arg): Replace %S references in the localized string.
 * @param [string] name: Corresponding string name in the properties file.
 * @param [any] arg: Value to insert for instances of %S.
 * @return [string]: Localized string with %S references replaced.
 *
 * @usage getString(name, args): Replace %1$S references in localized string.
 * @param [string] name: Corresponding string name in the properties file.
 * @param [array of any] args: Array of values to replace references like %1$S.
 * @return [string]: Localized string with %N$S references replaced.
 *
 * @usage getString(name, args, plural): Pick the correct plural form.
 * @param [string] name: Corresponding string name in the properties file.
 * @param [array of any] args: Array of values to replace references like %1$S.
 * @param [number] plural: Number to decide what plural form to use.
 * @return [string]: Localized string of the correct plural form.
 */
function getString(name, args, plural) {
  // Use the cached bundle to retrieve the string
  let str;
  try {
    str = getString.bundle.GetStringFromName(name);
  }
  // Use the fallback in-case the string isn't localized
  catch(ex) {
    str = getString.fallback.GetStringFromName(name);
  }

  // Pick out the correct plural form if necessary
  if (plural != null)
    str = getString.plural(plural, str);

  // Fill in the arguments if necessary
  if (args != null) {
    // Convert a string or something not array-like to an array
    if (typeof args == "string" || args.length == null)
      args = [args];

    // Assume %S refers to the first argument
    str = str.replace(/%s/gi, args[0]);

    // Replace instances of %N$S where N is a 1-based number
    Array.forEach(args, function(replacement, index) {
      str = str.replace(RegExp("%" + (index + 1) + "\\$S", "gi"), replacement);
    });
  }

  return str;
}

/**
 * Initialize getString() for the provided add-on.
 *
 * @usage getString.init(addon): Load properties file for the add-on.
 * @param [object] addon: Add-on object from AddonManager
 *
 * @usage getString.init(addon, getAlternate): Load properties with alternate.
 * @param [object] addon: Add-on object from AddonManager
 * @param [function] getAlternate: Convert a locale to an alternate locale
 */
getString.init = function(addon, getAlternate) {
  // Set a default get alternate function if it doesn't exist
  if (typeof getAlternate != "function")
    getAlternate = function() "en-US";

  // Get the bundled properties file for the app's locale
  function getBundle(locale) {
    let propertyPath = "locales/" + locale + ".properties";
    let propertyFile = addon.getResourceURI(propertyPath);

    // Get a bundle and test if it's able to do simple things
    try {
      // Avoid caching issues by always getting a new file
      let uniqueFileSpec = propertyFile.spec + "#" + Math.random();
      let bundle = Services.strings.createBundle(uniqueFileSpec);
      bundle.getSimpleEnumeration();
      return bundle;
    }
    catch(ex) {}

    // The locale must not exist, so give nothing
    return null;
  }

  // Use the current locale or the alternate as the primary bundle
  let locale = Cc["@mozilla.org/chrome/chrome-registry;1"].
    getService(Ci.nsIXULChromeRegistry).getSelectedLocale("global");
  getString.bundle = getBundle(locale) || getBundle(getAlternate(locale));

  // Create a fallback in-case a string is missing
  getString.fallback = getBundle("en-US");

  // Get the appropriate plural form getter
  Cu.import("resource://gre/modules/PluralForm.jsm");
  let rule = getString("pluralRule");
  [getString.plural] = PluralForm.makeGetter(rule);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}, reason) AddonManager.getAddonByID(id, function(addon) {
  // Initialize the strings for this add-on
  getString.init(addon);

  // Get some input/output from the current tab's window
  let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  let {alert, confirm, prompt} = gBrowser.selectedBrowser.contentWindow;

  // Ask the user for some information
  let name = prompt(getString("askName"));
  let money;
  do {
    // Get a number to pick what plural form of money to use
    let amount = Number(prompt(getString("howMany")));
    // Use the number to 1) insert it into the string and 2) pick the form
    money = getString("money", amount, amount);
  } while (!confirm(getString("confirm", money)));

  // Prepare an array to insert multiple values (the name and the money string)
  let pair = [name, money];
  alert(getString("hereHave", pair) + "\n" + getString("hopeEnough", pair));
})

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
