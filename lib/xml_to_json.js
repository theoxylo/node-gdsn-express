module.exports = function (config) {
  
  var log = require('./Logger.js')('xml-json', config)

  var xml_digester = require("xml-digester")

  xml_digester._logger.level(xml_digester._logger.WARN_LEVEL);
  
  function DigesterArrayHandler() {
    if (!(this instanceof DigesterArrayHandler)) return new DigesterArrayHandler()
    this.defaultHandler = new xml_digester.DefaultHandler();
  }

  DigesterArrayHandler.prototype.onopentag = function(node, digester) {
    //console.log('onopentag: ' + node)
    this.defaultHandler.onopentag(node, digester);
  }

  DigesterArrayHandler.prototype.onclosetag = function(node_name, digester) {
    //console.log('onclosetag: ' + node_name)

    var parent_object = digester.object_stack.pop();

    this.defaultHandler.textifyCurrentObject(digester);

    if (!parent_object[node_name]) parent_object[node_name] = []

    parent_object[node_name].push(digester.current_object);

    digester.current_object = parent_object;
  }
  var digesterArrayHandler = new DigesterArrayHandler()

  // the following GDSN elements may have multiple occurences and will be converted to array objects, 
  // length 1 to many (nothing converted for length 0, no empty arrays)
  var gdsn_arrays = [
      'childTradeItem'
    , 'measurementValue'
    , 'additionalTradeItemIdentification'
    , 'allowanceCharge'
    , 'additionalPartyIdentification'
    , 'additionalClassification'
    , 'gDSNTradeItemClassificationAttribute'
    , 'tradeItemDescription'
    , 'description'
    , 'barCodeType'
    , 'manufacturerOfTradeItem'
    , 'packagingMaterial'
    , 'tradeItemCountryOfOrigin'
    , 'tradeItemCountryOfAssembly'
    , 'packagingType'
    , 'packagingMarkingLanguage'
    , 'consumerUsageStorageInstructions'
    , 'priceOnTradeItem'
    , 'handlingInstructionsCode'
    , 'privateInformation'
    , 'tradeItemColorDescription'
    , 'countryOfOrigin'
    , 'materialComposition'
    , 'season'
    , 'tradeItemBarCodeInformation'
    , 'barCodeInformation'
    , 'tradeItemHazardousInformation'
    , 'dangerousGoodsTechnicalName'
    , 'tradeItemSizeDescription'
    , 'tradeItemTaxInformation'
    , 'tradeItemOrientation'
    , 'tradeItemFeatureBenefit'
    , 'tradeItemContactInformation'
    , 'tradeItemExternalInformation'
    , 'tradeItemCertificationInformation'
    // from FoodAndBeverageInformationType
    , 'foodAndBeverageAdditiveInformation'
    , 'foodAndBeverageAllergen'
    , 'foodAndBeverageDietRelatedInformation'
    , 'foodAndBeverageIngredient'
    , 'foodAndBeverageMicrobiologicalInformation'
    , 'foodAndBeverageNutrientInformation'
    , 'foodAndBeverageNutrient'
    , 'foodAndBeveragePhysiochemicalCharacteristic'
    , 'foodAndBeveragePreparationInformation'
    // from FoodAndBeverageTradeItemExtensionType
    , 'foodAndBeverageInformation'
    , 'preservationTechniqueCode'
    , 'productionFacility',
    , 'manufacturerPreparationTypeCode'
    , 'nutritionLabelTypeCode'
  ]
  var xml_digest = xml_digester.XmlDigester({
    handler: gdsn_arrays.map(function (e) { return { path : e, handler : digesterArrayHandler } })
  })

  return xml_digest
}
