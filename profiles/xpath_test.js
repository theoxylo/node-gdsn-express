module.exports = {
    client_name  : "XPath Custom JSON Test Client"
  , urls         : ['/cs_api/1.0/items', '/cs_api/1.0/subscribed']
  , json_transform : function (orig) {
      var item = {}
      item.now = Date.now()
      return item
    }
  , xml_mappings: {
      gtin        : "/tradeItem/tradeItemIdentification/gtin"
    , provider    : "/tradeItem/tradeItemInformation/informationProviderOfTradeItem/informationProvider/gln"
    , tm          : "/tradeItem/tradeItemInformation/targetMarketInformation/targetMarketCountryCode/countryISOCode"
    , unit_type   : "/tradeItem/tradeItemUnitDescriptor"
    , gpc         : "/tradeItem/tradeItemInformation/classificationCategoryCode/classificationCategoryCode"
    , brand       : "/tradeItem/tradeItemInformation/tradeItemDescriptionInformation/brandName"
    , tm_sub      : "/tradeItem/tradeItemInformation/targetMarketInformation/targetMarketSubdivisionCode/countrySubDivisionISOCode"
    , child_count : "/tradeItem/nextLowerLevelTradeItemInformation/quantityOfChildren"
    , child_gtins : "/tradeItem/nextLowerLevelTradeItemInformation/childTradeItem/tradeItemIdentification/gtin"
    , fn_name_en  : "/tradeItem/tradeItemInformation/tradeItemDescriptionInformation/functionalName/description[language/languageISOCode='en']/shortText"
    , width_value : "/tradeItem/tradeItemInformation/tradingPartnerNeutralTradeItemInformation/tradeItemMeasurements/width/measurementValue/value"
    , width_uom   : "/tradeItem/tradeItemInformation/tradingPartnerNeutralTradeItemInformation/tradeItemMeasurements/width/measurementValue/@unitOfMeasure"
    , infoods_ener_dvi   : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageNutrientInformation/foodAndBeverageNutrient[nutrientTypeCode[@iNFOODSCodeValue='ENER']]/percentageOfDailyValueIntake"
    , allergy_crustacean : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AC']/levelOfContainment"
    , allergy_eggs : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AE']/levelOfContainment"
    , allergy_fish : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AF']/levelOfContainment"
    , allergy_milk : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AM']/levelOfContainment"
    , allergy_treenuts : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AN']/levelOfContainment"
    , allergy_peanuts : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AP']/levelOfContainment"
    , allergy_sesame : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AS']/levelOfContainment"
    , allergy_cereals : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AW']/levelOfContainment"
    , allergy_gluten : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AX']/levelOfContainment"
    , allergy_soybean : "/tradeItem/extension/foodAndBeverageTradeItemExtension/foodAndBeverageInformation/foodAndBeverageAllergyRelatedInformation/foodAndBeverageAllergen[allergenTypeCode='AY']/levelOfContainment"
    , depthInches: "/tradeItem/tradeItemInformation/tradingPartnerNeutralTradeItemInformation/tradeItemMeasurements/depth/measurementValue[@unitOfMeasure='IN']/value"
    , depthFeet  : "/tradeItem/tradeItemInformation/tradingPartnerNeutralTradeItemInformation/tradeItemMeasurements/depth/measurementValue[@unitOfMeasure='FT']/value"

  }
}
