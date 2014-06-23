exports.getRequestHandler = function (config) {

  var log  = require('../lib/Logger')('lookup_nt', config)

  var nutrients = {
    "en": {
      'ENER'     : 'Energy'
    , 'ENER-'    : 'Energy'
    , 'ENERPF'   : 'Energy from Fat'
    , 'BIOT'     : 'Biotin'
    , 'NA'       : 'Sodium'
    , 'CHO-'     : 'Total Carbohydrate'
    , 'CHOL-'    : 'Cholesterol'
    , 'K'        : 'Potassium'
    , 'PRO-'     : 'Protein'
    , 'FAT'      : 'Total Fat'
    , 'FASAT'    : 'Saturated Fat'
    , 'FATRN'    : 'Trans Fat'
    , 'FATNLEA'  : 'Fat'
    , 'FAPU'     : 'Polyunsaturated Fat'
    , 'FAMS'     : 'Monounsaturated Fat'
    , 'SUGAR'    : 'Sugar'
    , 'SUGAR-'   : 'Sugar'
    , 'FIB-'     : 'Fiber'
    , 'FIBTG'    : 'Fiber'
    , 'FIBTSW'   : 'Fiber'
    , 'VITA-'    : 'Vitamin A'
    , 'VITC'     : 'Vitamin C'
    , 'VITC-'    : 'Vitamin C'
    , 'CA'       : 'Calcium'
    , 'FE'       : 'Iron'
    , 'VITD-'    : 'Vitamin D'
    , 'VITE-'    : 'Vitamin E'
    , 'VITK'     : 'Vitamin K'
    , 'THIA'     : 'Thiamin'
    , 'RIBF'     : 'Riboflavin'
    , 'NIA'      : 'Niacin'
    , 'NIAEQ'    : 'Niacin'
    , 'VITB6-'   : 'Vitamin B6'
    , 'FOL'      : 'Folate'
    , 'FOL-'     : 'Folate'
    , 'VITB12'   : 'Vitamin B12'
    , 'PANTAC'   : 'Pantothenic Acid'
    , 'P'        : 'Phosphorus'
    , 'ID'       : 'Iodine'
    , 'MG'       : 'Magnesium'
    , 'ZN'       : 'Zinc'
    , 'SE'       : 'Selenium'
    , 'CU'       : 'Copper'
    , 'MN'       : 'Manganese'
    , 'CR'       : 'Chromium'
    , 'MO'       : 'Molybdenum'
    , 'CLD'      : 'Chloride'
    },
    "es": {
      'ENER'     : 'Energy'
    , 'ENER-'    : 'Energy'
    , 'ENERPF'   : 'Energy from Fat'
    , 'BIOT'     : 'Biotin'
    , 'NA'       : 'Sodium'
    , 'CHO-'     : 'Total Carbohydrate'
    , 'CHOL-'    : 'Cholesterol'
    , 'K'        : 'Potassium'
    , 'PRO-'     : 'Protein'
    , 'FAT'      : 'Total Fat'
    , 'FASAT'    : 'Saturated Fat'
    , 'FATRN'    : 'Trans Fat'
    , 'FATNLEA'  : 'Fat'
    , 'FAPU'     : 'Polyunsaturated Fat'
    , 'FAMS'     : 'Monounsaturated Fat'
    , 'SUGAR'    : 'Sugar'
    , 'SUGAR-'   : 'Sugar'
    , 'FIB-'     : 'Fiber'
    , 'FIBTG'    : 'Fiber'
    , 'FIBTSW'   : 'Fiber'
    , 'VITA-'    : 'Vitamin A'
    , 'VITC'     : 'Vitamin C'
    , 'VITC-'    : 'Vitamin C'
    , 'CA'       : 'Calcium'
    , 'FE'       : 'Iron'
    , 'VITD-'    : 'Vitamin D'
    , 'VITE-'    : 'Vitamin E'
    , 'VITK'     : 'Vitamin K'
    , 'THIA'     : 'Thiamin'
    , 'RIBF'     : 'Riboflavin'
    , 'NIA'      : 'Niacin'
    , 'NIAEQ'    : 'Niacin'
    , 'VITB6-'   : 'Vitamin B6'
    , 'FOL'      : 'Folate'
    , 'FOL-'     : 'Folate'
    , 'VITB12'   : 'Vitamin B12'
    , 'PANTAC'   : 'Pantothenic Acid'
    , 'P'        : 'Phosphorus'
    , 'ID'       : 'Iodine'
    , 'MG'       : 'Magnesium'
    , 'ZN'       : 'Zinc'
    , 'SE'       : 'Selenium'
    , 'CU'       : 'Copper'
    , 'MN'       : 'Manganese'
    , 'CR'       : 'Chromium'
    , 'MO'       : 'Molybdenum'
    , 'CLD'      : 'Chloride'
    },
    "fr": {
      'ENER'     : 'Energy'
    , 'ENER-'    : 'Energy'
    , 'ENERPF'   : 'Energy from Fat'
    , 'BIOT'     : 'Biotin'
    , 'NA'       : 'Sodium'
    , 'CHO-'     : 'Total Carbohydrate'
    , 'CHOL-'    : 'Cholesterol'
    , 'K'        : 'Potassium'
    , 'PRO-'     : 'Protein'
    , 'FAT'      : 'Total Fat'
    , 'FASAT'    : 'Saturated Fat'
    , 'FATRN'    : 'Trans Fat'
    , 'FATNLEA'  : 'Fat'
    , 'FAPU'     : 'Polyunsaturated Fat'
    , 'FAMS'     : 'Monounsaturated Fat'
    , 'SUGAR'    : 'Sugar'
    , 'SUGAR-'   : 'Sugar'
    , 'FIB-'     : 'Fiber'
    , 'FIBTG'    : 'Fiber'
    , 'FIBTSW'   : 'Fiber'
    , 'VITA-'    : 'Vitamin A'
    , 'VITC'     : 'Vitamin C'
    , 'VITC-'    : 'Vitamin C'
    , 'CA'       : 'Calcium'
    , 'FE'       : 'Iron'
    , 'VITD-'    : 'Vitamin D'
    , 'VITE-'    : 'Vitamin E'
    , 'VITK'     : 'Vitamin K'
    , 'THIA'     : 'Thiamin'
    , 'RIBF'     : 'Riboflavin'
    , 'NIA'      : 'Niacin'
    , 'NIAEQ'    : 'Niacin'
    , 'VITB6-'   : 'Vitamin B6'
    , 'FOL'      : 'Folate'
    , 'FOL-'     : 'Folate'
    , 'VITB12'   : 'Vitamin B12'
    , 'PANTAC'   : 'Pantothenic Acid'
    , 'P'        : 'Phosphorus'
    , 'ID'       : 'Iodine'
    , 'MG'       : 'Magnesium'
    , 'ZN'       : 'Zinc'
    , 'SE'       : 'Selenium'
    , 'CU'       : 'Copper'
    , 'MN'       : 'Manganese'
    , 'CR'       : 'Chromium'
    , 'MO'       : 'Molybdenum'
    , 'CLD'      : 'Chloride'
    }
  }

  return function(req, res, next) {
    log.debug('lookup_nutrients query: ' + req.query)
    if (req.url.indexOf('?') < 0) {
      return res.render('lookup_nutrient_api_docs_10')
    }
    var code = req.param('code')
    var lang = req.param('lang') || 'en'
    var result = {
        lang: lang
      , timestamp: Date.now()
      , href: req.url
    }
    if (!code) {
      result.nutrients = nutrients[lang]
    }
    else {
      var name = nutrients[lang][code] || 'n/a'
      result.nutrients = {}
      result.nutrients[code] = name
    }
    log.info(result)

    res.json(result)
    res.end
  }
}
