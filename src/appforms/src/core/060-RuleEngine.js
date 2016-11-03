/*! fh-forms - v1.6.0 -  */
/*! async - v0.2.9 -  */
/*! 2016-05-13 */
(function e(t,n,r) {
  function s(o,u) {
    if (!n[o]) {
      if (!t[o]) {
        var a=typeof require=="function"&&require;if (!u&&a) return a(o,!0);if (i) return i(o,!0);var f=new Error(`Cannot find module '${o}'`);throw f.code="MODULE_NOT_FOUND",f;
      } var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e) {
        var n=t[o][1][e];return s(n?n:e);
      },l,l.exports,e,t,n,r);} return n[o].exports;
  } var i=typeof require=="function"&&require;for (var o=0;o<r.length;o++)s(r[o]);return s;
})({1:[function(require,module,exports) {
  (function() {

    var async = require('async');
    var _ = require('underscore');
    var moment = require('moment');

    /*
     * Sample Usage
     *
     * var engine = formsRulesEngine(form-definition);
     *
     * engine.validateForms(form-submission, function(err, res) {});
     *      res:
     *      {
     *          "validation": {
     *              "fieldId": {
     *                  "fieldId": "",
     *                  "valid": true,
     *                  "errorMessages": [
     *                      "length should be 3 to 5",
     *                      "should not contain dammit",
     *                      "should repeat at least 2 times"
     *                  ]
     *              },
     *              "fieldId1": {
     *
     *              }
     *          }
     *      }
     *
     *
     * engine.validateField(fieldId, submissionJSON, function(err,res) {});
     *      // validate only field values on validation (no rules, no repeat checking)
     *      res:
     *      "validation":{
     *              "fieldId":{
     *                  "fieldId":"",
     *                  "valid":true,
     *                  "errorMessages":[
     *                      "length should be 3 to 5",
     *                      "should not contain dammit"
     *                  ]
     *              }
     *          }
     *
     * engine.checkRules(submissionJSON, unction(err, res) {})
     *      // check all rules actions
     *      res:
     *      {
     *          "actions": {
     *              "pages": {
     *                  "targetId": {
     *                      "targetId": "",
     *                      "action": "show|hide"
     *                  }
     *              },
     *              "fields": {
     *
     *              }
     *          }
     *      }
     *
     */

    var FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY = "date";
    var FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY = "time";
    var FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME = "datetime";

    var formsRulesEngine = function(formDef) {
      var initialised;

      var definition = formDef;
      var submission;

      var fieldMap = {};
      var adminFieldMap ={}; //Admin fields should not be part of a submission
      var requiredFieldMap = {};
      var submissionRequiredFieldsMap = {}; // map to hold the status of the required fields per submission
      var fieldRulePredicateMap = {};
      var fieldRuleSubjectMap = {};
      var pageRulePredicateMap = {};
      var pageRuleSubjectMap = {};
      var submissionFieldsMap = {};
      var validatorsMap = {
        "text": validatorString,
        "textarea": validatorString,
        "number": validatorNumericString,
        "emailAddress": validatorEmail,
        "dropdown": validatorDropDown,
        "radio": validatorRadio,
        "checkboxes": validatorCheckboxes,
        "location": validatorLocation,
        "locationMap": validatorLocationMap,
        "photo": validatorFile,
        "signature": validatorFile,
        "file": validatorFile,
        "dateTime": validatorDateTime,
        "url": validatorString,
        "sectionBreak": validatorSection,
        "barcode": validatorBarcode,
        "sliderNumber": validatorNumericString,
        "readOnly": function() {
          //readonly fields need no validation. Values are ignored.
          return true;
        }
      };

      var validatorsClientMap = {
        "text": validatorString,
        "textarea": validatorString,
        "number": validatorNumericString,
        "emailAddress": validatorEmail,
        "dropdown": validatorDropDown,
        "radio": validatorRadio,
        "checkboxes": validatorCheckboxes,
        "location": validatorLocation,
        "locationMap": validatorLocationMap,
        "photo": validatorAnyFile,
        "signature": validatorAnyFile,
        "file": validatorAnyFile,
        "dateTime": validatorDateTime,
        "url": validatorString,
        "sectionBreak": validatorSection,
        "barcode": validatorBarcode,
        "sliderNumber": validatorNumericString,
        "readOnly": function() {
          //readonly fields need no validation. Values are ignored.
          return true;
        }
      };

      //Custom functions to define whether a field is required or not.
      var valueRequiredMap = {
        "dropdown": function dropdownRequiredFunction(fieldDef) {
          //A dropdown field is only required if the blank option is not set
          return fieldDef && fieldDef.fieldOptions && fieldDef.fieldOptions.definition && fieldDef.fieldOptions.definition.include_blank_option;
        }
      };

      var fieldValueComparison = {
        "text": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "textarea": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "number": function(fieldValue, testValue, condition) {
          return this.numericalComparison(fieldValue, testValue, condition);
        },
        "emailAddress": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "dropdown": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "radio": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "checkboxes": function(fieldValue, testValue, condition) {
          fieldValue = fieldValue || {};
          var valueFound = false;

          if (!(fieldValue.selections instanceof Array)) {
            return false;
          }

          //Check if the testValue is contained in the selections
          for (var selectionIndex = 0; selectionIndex < fieldValue.selections.length; selectionIndex++ ) {
            var selectionValue = fieldValue.selections[selectionIndex];
            //Note, here we are using the "is" string comparator to check if the testValue matches the current selectionValue
            if (this.comparisonString(selectionValue, testValue, "is")) {
              valueFound = true;
            }
          }

          if (condition === "is") {
            return valueFound;
          } else {
            return !valueFound;
          }

        },
        "dateTime": function(fieldValue, testValue, condition, fieldOptions) {
          var valid = false;

          fieldOptions = fieldOptions || {definition: {}};

          //dateNumVal is assigned an easily comparible number depending on the type of units used.
          var dateNumVal = null;
          var testNumVal = null;

          switch (fieldOptions.definition.datetimeUnit) {
          case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY:
            try {
              dateNumVal = new Date(new Date(fieldValue).toDateString()).getTime();
              testNumVal = new Date(new Date(testValue).toDateString()).getTime();
              valid = true;
            } catch (e) {
              dateNumVal = null;
              testNumVal = null;
              valid = false;
            }
            break;
          case FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY:
            var cvtTime = this.cvtTimeToSeconds(fieldValue);
            var cvtTestVal = this.cvtTimeToSeconds(testValue);
            dateNumVal = cvtTime.seconds;
            testNumVal = cvtTestVal.seconds;
            valid = cvtTime.valid && cvtTestVal.valid;
            break;
          case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME:
            try {
              dateNumVal = (new Date(fieldValue).getTime());
              testNumVal = (new Date(testValue).getTime());
              valid = true;
            } catch (e) {
              valid = false;
            }
            break;
          default:
            valid = false;
            break;
          }

          //The value is not valid, no point in comparing.
          if (!valid) {
            return false;
          }

          if ("is at" === condition) {
            valid = dateNumVal === testNumVal;
          } else if ("is before" === condition) {
            valid = dateNumVal < testNumVal;
          } else if ("is after" === condition) {
            valid = dateNumVal > testNumVal;
          } else {
            valid = false;
          }

          return valid;
        },
        "url": function(fieldValue, testValue, condition) {
          return this.comparisonString(fieldValue, testValue, condition);
        },
        "barcode": function(fieldValue, testValue, condition) {
          fieldValue = fieldValue || {};

          if (typeof(fieldValue.text) !== "string") {
            return false;
          }

          return this.comparisonString(fieldValue.text, testValue, condition);
        },
        "sliderNumber": function(fieldValue, testValue, condition) {
          return this.numericalComparison(fieldValue, testValue, condition);
        },
        "comparisonString": function(fieldValue, testValue, condition) {
          var valid = true;

          if ("is" === condition) {
            valid = fieldValue === testValue;
          } else if ("is not" === condition) {
            valid = fieldValue !== testValue;
          } else if ("contains" === condition) {
            valid = fieldValue.indexOf(testValue) !== -1;
          } else if ("does not contain" === condition) {
            valid = fieldValue.indexOf(testValue) === -1;
          } else if ("begins with" === condition) {
            valid = fieldValue.substring(0, testValue.length) === testValue;
          } else if ("ends with" === condition) {
            valid = fieldValue.substring(Math.max(0, (fieldValue.length - testValue.length)), fieldValue.length) === testValue;
          } else {
            valid = false;
          }

          return valid;
        },
        "numericalComparison": function(fieldValue, testValue, condition) {
          var fieldValNum = parseInt(fieldValue, 10);
          var testValNum = parseInt(testValue, 10);

          if (isNaN(fieldValNum) || isNaN(testValNum)) {
            return false;
          }

          if ("is equal to" === condition) {
            return fieldValNum === testValNum;
          } else if ("is less than" === condition) {
            return fieldValNum < testValNum;
          } else if ("is greater than" === condition) {
            return fieldValNum > testValNum;
          } else {
            return false;
          }
        },
        "cvtTimeToSeconds": function(fieldValue) {
          var valid = false;
          var seconds = 0;
          if (typeof fieldValue === "string") {
            var parts = fieldValue.split(':');
            valid = (parts.length === 2) || (parts.length === 3);
            if (valid) {
              valid = isNumberBetween(parts[0], 0, 23);
              seconds += (parseInt(parts[0], 10) * 60 * 60);
            }
            if (valid) {
              valid = isNumberBetween(parts[1], 0, 59);
              seconds += (parseInt(parts[1], 10) * 60);
            }
            if (valid && (parts.length === 3)) {
              valid = isNumberBetween(parts[2], 0, 59);
              seconds += parseInt(parts[2], 10);
            }
          }
          return {valid: valid, seconds: seconds};
        }
      };



      var isFieldRuleSubject = function(fieldId) {
        return !!fieldRuleSubjectMap[fieldId];
      };

      var isPageRuleSubject = function(pageId) {
        return !!pageRuleSubjectMap[pageId];
      };

      function buildFieldMap() {
        // Iterate over all fields in form definition & build fieldMap
        _.each(definition.pages, function(page) {
          _.each(page.fields, function(field) {
            field.pageId = page._id;

            /**
             * If the field is an admin field, then it is not considered part of validation for a submission.
             */
            if (field.adminOnly) {
              adminFieldMap[field._id] = field;
              return;
            }

            field.fieldOptions = field.fieldOptions ? field.fieldOptions : {};
            field.fieldOptions.definition = field.fieldOptions.definition ? field.fieldOptions.definition : {};
            field.fieldOptions.validation = field.fieldOptions.validation ? field.fieldOptions.validation : {};

            fieldMap[field._id] = field;

            if (field.required) {
              requiredFieldMap[field._id] = {
                field: field,
                submitted: false,
                validated: false,
                valueRequired: !(valueRequiredMap[field.type] && valueRequiredMap[field.type](field))
              };
            }

          });
        });
      }

      function buildFieldRuleMaps() {
        // Iterate over all rules in form definition & build ruleSubjectMap
        _.each(definition.fieldRules, function(rule) {
          _.each(rule.ruleConditionalStatements, function(ruleConditionalStatement) {
            var fieldId = ruleConditionalStatement.sourceField;
            fieldRulePredicateMap[fieldId] = fieldRulePredicateMap[fieldId] || [];
            fieldRulePredicateMap[fieldId].push(rule);
          });
          /**
           * Target fields are an array of fieldIds that can be targeted by a field rule
           * To maintain backwards compatibility, the case where the targetPage is not an array has to be considered
           * @type {*|Array}
           */
          if (_.isArray(rule.targetField)) {
            _.each(rule.targetField, function(targetField) {
              fieldRuleSubjectMap[targetField] = fieldRuleSubjectMap[targetField] || [];
              fieldRuleSubjectMap[targetField].push(rule);
            });
          } else {
            fieldRuleSubjectMap[rule.targetField] = fieldRuleSubjectMap[rule.targetField] || [];
            fieldRuleSubjectMap[rule.targetField].push(rule);
          }
        });
      }

      function buildPageRuleMap() {
        // Iterate over all rules in form definition & build ruleSubjectMap
        _.each(definition.pageRules, function(rule) {
          _.each(rule.ruleConditionalStatements, function(ruleConditionalStatement) {
            var fieldId = ruleConditionalStatement.sourceField;
            pageRulePredicateMap[fieldId] = pageRulePredicateMap[fieldId] || [];
            pageRulePredicateMap[fieldId].push(rule);
          });

          /**
           * Target pages are an array of pageIds that can be targeted by a page rule
           * To maintain backwards compatibility, the case where the targetPage is not an array has to be considered
           * @type {*|Array}
           */
          if (_.isArray(rule.targetPage)) {
            _.each(rule.targetPage, function(targetPage) {
              pageRuleSubjectMap[targetPage] = pageRuleSubjectMap[targetPage] || [];
              pageRuleSubjectMap[targetPage].push(rule);
            });
          } else {
            pageRuleSubjectMap[rule.targetPage] = pageRuleSubjectMap[rule.targetPage] || [];
            pageRuleSubjectMap[rule.targetPage].push(rule);
          }
        });
      }

      function buildSubmissionFieldsMap() {
        submissionRequiredFieldsMap = JSON.parse(JSON.stringify(requiredFieldMap)); // clone the map for use with this submission
        submissionFieldsMap = {}; // start with empty map, rulesEngine can be called with multiple submissions
        var error;

        // iterate over all the fields in the submissions and build a map for easier lookup
        _.each(submission.formFields, function(formField) {
          if (!formField.fieldId) {
            error = new Error(`No fieldId in this submission entry: ${JSON.stringify(formField)}`);
            return;
          }

          /**
           * If the field passed in a submission is an admin field, then return an error.
           */
          if (adminFieldMap[formField.fieldId]) {
            error = `Submission ${formField.fieldId} is an admin field. Admin fields cannot be passed to the rules engine.`;
            return;
          }

          submissionFieldsMap[formField.fieldId] = formField;
        });
        return error;
      }

      function init() {
        if (initialised) {
          return;
        }
        buildFieldMap();
        buildFieldRuleMaps();
        buildPageRuleMap();

        initialised = true;
      }

      function initSubmission(formSubmission) {
        init();
        submission = formSubmission;
        return buildSubmissionFieldsMap();
      }

      function getPreviousFieldValues(submittedField, previousSubmission, cb) {
        if (previousSubmission && previousSubmission.formFields) {
          async.filter(previousSubmission.formFields, function(formField, cb) {
            return cb(formField.fieldId.toString() === submittedField.fieldId.toString());
          }, function(results) {
            var previousFieldValues = null;
            if (results && results[0] && results[0].fieldValues) {
              previousFieldValues = results[0].fieldValues;
            }
            return cb(undefined, previousFieldValues);
          });
        } else {
          return cb();
        }
      }

      function validateForm(submission, previousSubmission, cb) {
        if ("function" === typeof previousSubmission) {
          cb = previousSubmission;
          previousSubmission = null;
        }
        init();
        var err = initSubmission(submission);
        if (err) {
          return cb(err);
        }
        async.waterfall([
          function(cb) {
            var response = {
              validation: {
                valid: true
              }
            };

            validateSubmittedFields(response, previousSubmission, cb);
          },
          checkIfRequiredFieldsNotSubmitted
        ], function(err, results) {
          if (err) {
            return cb(err);
          }

          return cb(undefined, results);
        });
      }

      function validateSubmittedFields(res, previousSubmission, cb) {
        // for each field, call validateField
        async.each(submission.formFields, function(submittedField, callback) {
          var fieldID = submittedField.fieldId;
          var fieldDef = fieldMap[fieldID];

          getPreviousFieldValues(submittedField, previousSubmission, function(err, previousFieldValues) {
            if (err) {
              return callback(err);
            }
            getFieldValidationStatus(submittedField, fieldDef, previousFieldValues, function(err, fieldRes) {
              if (err) {
                return callback(err);
              }

              if (!fieldRes.valid) {
                res.validation.valid = false; // indicate invalid form if any fields invalid
                res.validation[fieldID] = fieldRes; // add invalid field info to validate form result
              }

              return callback();
            });

          });
        }, function(err) {
          if (err) {
            return cb(err);
          }
          return cb(undefined, res);
        });
      }

      function checkIfRequiredFieldsNotSubmitted(res, cb) {
        async.each(Object.keys(submissionRequiredFieldsMap), function(requiredFieldId, cb) {
          var resField = {};
          var requiredField = submissionRequiredFieldsMap[requiredFieldId];

          if (!requiredField.submitted) {
            isFieldVisible(requiredFieldId, true, function(err, visible) {
              if (err) {
                return cb(err);
              }

              if (visible && requiredField.valueRequired) { // we only care about required fields if they are visible
                resField.fieldId = requiredFieldId;
                resField.valid = false;
                resField.fieldErrorMessage = ["Required Field Not Submitted"];
                res.validation[requiredFieldId] = resField;
                res.validation.valid = false;
              }
              return cb();
            });
          } else { // was included in submission
            return cb();
          }
        }, function(err) {
          if (err) {
            return cb(err);
          }

          return cb(undefined, res);
        });
      }

      /*
       * validate only field values on validation (no rules, no repeat checking)
       *     res:
       *     "validation":{
       *             "fieldId":{
       *                 "fieldId":"",
       *                 "valid":true,
       *                 "errorMessages":[
       *                     "length should be 3 to 5",
       *                     "should not contain dammit"
       *                 ]
       *             }
       *         }
       */
      function validateField(fieldId, submission, cb) {
        init();
        var err = initSubmission(submission);
        if (err) {
          return cb(err);
        }

        var submissionField = submissionFieldsMap[fieldId];
        var fieldDef = fieldMap[fieldId];
        getFieldValidationStatus(submissionField, fieldDef, null, function(err, res) {
          if (err) {
            return cb(err);
          }
          var ret = {
            validation: {}
          };
          ret.validation[fieldId] = res;
          return cb(undefined, ret);
        });
      }

      /*
       * validate only single field value (no rules, no repeat checking)
       * cb(err, result)
       * example of result:
       * "validation":{
       *         "fieldId":{
       *             "fieldId":"",
       *             "valid":true,
       *             "errorMessages":[
       *                 "length should be 3 to 5",
       *                 "should not contain dammit"
       *             ]
       *         }
       *     }
       */
      function validateFieldValue(fieldId, inputValue, valueIndex, cb) {
        if ("function" === typeof valueIndex) {
          cb = valueIndex;
          valueIndex = 0;
        }

        init();

        var fieldDefinition = fieldMap[fieldId];

        var required = false;
        if (fieldDefinition.repeating &&
          fieldDefinition.fieldOptions &&
          fieldDefinition.fieldOptions.definition &&
          fieldDefinition.fieldOptions.definition.minRepeat) {
          required = (valueIndex < fieldDefinition.fieldOptions.definition.minRepeat);
        } else {
          required = fieldDefinition.required;
        }

        var validation = (fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation) ? fieldDefinition.fieldOptions.validation : undefined;

        if (validation && false === validation.validateImmediately) {
          var ret = {
            validation: {}
          };
          ret.validation[fieldId] = {
            "valid": true
          };
          return cb(undefined, ret);
        }

        var requiredFieldEntry = requiredFieldMap[fieldDefinition._id] || {valueRequired: required};

        if (fieldEmpty(inputValue)) {
          if (required && requiredFieldEntry.valueRequired) {
            return formatResponse("No value specified for required input", cb);
          } else {
            return formatResponse(undefined, cb); // optional field not supplied is valid
          }
        }

        // not empty need to validate
        getClientValidatorFunction(fieldDefinition.type, function(err, validator) {
          if (err) {
            return cb(err);
          }

          validator(inputValue, fieldDefinition, undefined, function(err) {
            var message;
            if (err) {
              if (err.message) {
                message = err.message;
              } else {
                message = "Unknown error message";
              }
            }
            formatResponse(message, cb);
          });
        });

        function formatResponse(msg, cb) {
          var messages = {
            errorMessages: []
          };
          if (msg) {
            messages.errorMessages.push(msg);
          }
          return createValidatorResponse(fieldId, messages, function(err, res) {
            if (err) {
              return cb(err);
            }
            var ret = {
              validation: {}
            };
            ret.validation[fieldId] = res;
            return cb(undefined, ret);
          });
        }
      }

      function createValidatorResponse(fieldId, messages, cb) {
        // intentionally not checking err here, used further down to get validation errors
        var res = {};
        res.fieldId = fieldId;
        res.errorMessages = messages.errorMessages || [];
        res.fieldErrorMessage = messages.fieldErrorMessage || [];
        async.some(res.errorMessages, function(item, cb) {
          return cb(item !== null);
        }, function(someErrors) {
          res.valid = !someErrors && (res.fieldErrorMessage.length < 1);

          return cb(undefined, res);
        });
      }

      function getFieldValidationStatus(submittedField, fieldDef, previousFieldValues, cb) {
        isFieldVisible(fieldDef._id, true, function(err, visible) {
          if (err) {
            return cb(err);
          }
          validateFieldInternal(submittedField, fieldDef, previousFieldValues, visible, function(err, messages) {
            if (err) {
              return cb(err);
            }
            createValidatorResponse(submittedField.fieldId, messages, cb);
          });
        });
      }

      function getMapFunction(key, map, cb) {
        var validator = map[key];
        if (!validator) {
          return cb(new Error(`Invalid Field Type ${key}`));
        }

        return cb(undefined, validator);
      }

      function getValidatorFunction(fieldType, cb) {
        return getMapFunction(fieldType, validatorsMap, cb);
      }

      function getClientValidatorFunction(fieldType, cb) {
        return getMapFunction(fieldType, validatorsClientMap, cb);
      }

      function fieldEmpty(fieldValue) {
        return ('undefined' === typeof fieldValue || null === fieldValue || "" === fieldValue); // empty string also regarded as not specified
      }

      function validateFieldInternal(submittedField, fieldDef, previousFieldValues, visible, cb) {
        previousFieldValues = previousFieldValues || null;
        countSubmittedValues(submittedField, function(err, numSubmittedValues) {
          if (err) {
            return cb(err);
          }
          //Marking the visibility of the field on the definition.
          fieldDef.visible = visible;
          async.series({
            valuesSubmitted: async.apply(checkValueSubmitted, submittedField, fieldDef, visible),
            repeats: async.apply(checkRepeat, numSubmittedValues, fieldDef, visible),
            values: async.apply(checkValues, submittedField, fieldDef, previousFieldValues)
          }, function(err, results) {
            if (err) {
              return cb(err);
            }

            var fieldErrorMessages = [];
            if (results.valuesSubmitted) {
              fieldErrorMessages.push(results.valuesSubmitted);
            }
            if (results.repeats) {
              fieldErrorMessages.push(results.repeats);
            }
            return cb(undefined, {
              fieldErrorMessage: fieldErrorMessages,
              errorMessages: results.values
            });
          });
        });

        return; // just functions below this

        function checkValueSubmitted(submittedField, fieldDefinition, visible, cb) {
          if (!fieldDefinition.required) {
            return cb(undefined, null);
          }

          var valueSubmitted = submittedField && submittedField.fieldValues && (submittedField.fieldValues.length > 0);
          //No value submitted is only an error if the field is visible.

          //If the field value has been marked as not required, then don't fail a no-value submission
          var valueRequired = requiredFieldMap[fieldDefinition._id] && requiredFieldMap[fieldDefinition._id].valueRequired;

          if (!valueSubmitted && visible && valueRequired) {
            return cb(undefined, `No value submitted for field ${fieldDefinition.name}`);
          }
          return cb(undefined, null);

        }

        function countSubmittedValues(submittedField, cb) {
          var numSubmittedValues = 0;
          if (submittedField && submittedField.fieldValues && submittedField.fieldValues.length > 0) {
            for (var i = 0; i < submittedField.fieldValues.length; i += 1) {
              if (submittedField.fieldValues[i]) {
                numSubmittedValues += 1;
              }
            }
          }
          return cb(undefined, numSubmittedValues);
        }

        function checkRepeat(numSubmittedValues, fieldDefinition, visible, cb) {
          //If the field is not visible, then checking the repeating values of the field is not required
          if (!visible) {
            return cb(undefined, null);
          }

          if (fieldDefinition.repeating && fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.definition) {
            if (fieldDefinition.fieldOptions.definition.minRepeat) {
              if (numSubmittedValues < fieldDefinition.fieldOptions.definition.minRepeat) {
                return cb(undefined, `Expected min of ${fieldDefinition.fieldOptions.definition.minRepeat} values for field ${fieldDefinition.name} but got ${numSubmittedValues}`);
              }
            }

            if (fieldDefinition.fieldOptions.definition.maxRepeat) {
              if (numSubmittedValues > fieldDefinition.fieldOptions.definition.maxRepeat) {
                return cb(undefined, `Expected max of ${fieldDefinition.fieldOptions.definition.maxRepeat} values for field ${fieldDefinition.name} but got ${numSubmittedValues}`);
              }
            }
          } else if (numSubmittedValues > 1) {
            return cb(undefined, "Should not have multiple values for non-repeating field");
          }

          return cb(undefined, null);
        }

        function checkValues(submittedField, fieldDefinition, previousFieldValues, cb) {
          getValidatorFunction(fieldDefinition.type, function(err, validator) {
            if (err) {
              return cb(err);
            }
            async.map(submittedField.fieldValues, function(fieldValue, cb) {
              if (fieldEmpty(fieldValue)) {
                return cb(undefined, null);
              } else {
                validator(fieldValue, fieldDefinition, previousFieldValues, function(validationError) {
                  var errorMessage;
                  if (validationError) {
                    errorMessage = validationError.message || "Error during validation of field";
                  } else {
                    errorMessage = null;
                  }

                  if (submissionRequiredFieldsMap[fieldDefinition._id]) { // set to true if at least one value
                    submissionRequiredFieldsMap[fieldDefinition._id].submitted = true;
                  }

                  return cb(undefined, errorMessage);
                });
              }
            }, function(err, results) {
              if (err) {
                return cb(err);
              }

              return cb(undefined, results);
            });
          });
        }
      }

      function convertSimpleFormatToRegex(field_format_string) {
        var regex = "^";
        var C = "c".charCodeAt(0);
        var N = "n".charCodeAt(0);

        var i;
        var ch;
        var match;
        var len = field_format_string.length;
        for (i = 0; i < len; i += 1) {
          ch = field_format_string.charCodeAt(i);
          switch (ch) {
          case C:
            match = "[a-zA-Z0-9]";
            break;
          case N:
            match = "[0-9]";
            break;
          default:
            var num = ch.toString(16).toUpperCase();
            match = `\\u${(`0000${num}`).substr(-4)}`;
            break;
          }
          regex += match;
        }
        return `${regex}$`;
      }

      function validFormatRegex(fieldValue, field_format_string) {
        var pattern = new RegExp(field_format_string);
        return pattern.test(fieldValue);
      }

      function validFormat(fieldValue, field_format_mode, field_format_string) {
        var regex;
        if ("simple" === field_format_mode) {
          regex = convertSimpleFormatToRegex(field_format_string);
        } else if ("regex" === field_format_mode) {
          regex = field_format_string;
        } else { // should never be anything else, but if it is then default to simple format
          regex = convertSimpleFormatToRegex(field_format_string);
        }

        return validFormatRegex(fieldValue, regex);
      }

      function validatorString(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof fieldValue !== "string") {
          return cb(new Error(`Expected string but got ${typeof(fieldValue)}`));
        }

        var validation = {};
        if (fieldDefinition && fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation) {
          validation = fieldDefinition.fieldOptions.validation;
        }

        var field_format_mode = validation.field_format_mode || "";
        field_format_mode = field_format_mode.trim();
        var field_format_string = validation.field_format_string || "";
        field_format_string = field_format_string.trim();

        if (field_format_string && (field_format_string.length > 0) && field_format_mode && (field_format_mode.length > 0)) {
          if (!validFormat(fieldValue, field_format_mode, field_format_string)) {
            return cb(new Error(`field value in incorrect format, expected format: ${field_format_string} but submission value is: ${fieldValue}`));
          }
        }

        if (fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation && fieldDefinition.fieldOptions.validation.min) {
          if (fieldValue.length < fieldDefinition.fieldOptions.validation.min) {
            return cb(new Error(`Expected minimum string length of ${fieldDefinition.fieldOptions.validation.min} but submission is ${fieldValue.length}. Submitted val: ${fieldValue}`));
          }
        }

        if (fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation && fieldDefinition.fieldOptions.validation.max) {
          if (fieldValue.length > fieldDefinition.fieldOptions.validation.max) {
            return cb(new Error(`Expected maximum string length of ${fieldDefinition.fieldOptions.validation.max} but submission is ${fieldValue.length}. Submitted val: ${fieldValue}`));
          }
        }

        return cb();
      }

      function validatorNumericString(fieldValue, fieldDefinition, previousFieldValues, cb) {
        var testVal = (fieldValue - 0); // coerce to number (or NaN)
        /* eslint-disable eqeqeq */
        var numeric = (testVal == fieldValue); // testVal co-erced to numeric above, so numeric comparison and NaN != NaN

        if (!numeric) {
          return cb(new Error(`Expected numeric but got: ${fieldValue}`));
        }

        return validatorNumber(testVal, fieldDefinition, previousFieldValues, cb);
      }

      function validatorNumber(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof fieldValue !== "number") {
          return cb(new Error(`Expected number but got ${typeof(fieldValue)}`));
        }

        if (fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation && fieldDefinition.fieldOptions.validation.min) {
          if (fieldValue < fieldDefinition.fieldOptions.validation.min) {
            return cb(new Error(`Expected minimum Number ${fieldDefinition.fieldOptions.validation.min} but submission is ${fieldValue}. Submitted number: ${fieldValue}`));
          }
        }

        if (fieldDefinition.fieldOptions.validation.max) {
          if (fieldValue > fieldDefinition.fieldOptions.validation.max) {
            return cb(new Error(`Expected maximum Number ${fieldDefinition.fieldOptions.validation.max} but submission is ${fieldValue}. Submitted number: ${fieldValue}`));
          }
        }

        return cb();
      }

      function validatorEmail(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof(fieldValue) !== "string") {
          return cb(new Error(`Expected string but got ${typeof(fieldValue)}`));
        }

        if (fieldValue.match(/[-0-9a-zA-Z.+_]+@[-0-9a-zA-Z.+_]+\.[a-zA-Z]{2,4}/g) === null) {
          return cb(new Error(`Invalid email address format: ${fieldValue}`));
        } else {
          return cb();
        }
      }


      /**
       * validatorDropDown - Validator function for dropdown fields.
       *
       * @param  {string} fieldValue        The value to validate
       * @param  {object} fieldDefinition   Full JSON definition of the field
       * @param  {array} previousFieldValues Any values previously stored with the fields
       * @param  {function} cb               Callback function
       */
      function validatorDropDown(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof(fieldValue) !== "string") {
          return cb(new Error(`Expected submission to be string but got ${typeof(fieldValue)}`));
        }

        fieldDefinition.fieldOptions = fieldDefinition.fieldOptions || {};
        fieldDefinition.fieldOptions.definition = fieldDefinition.fieldOptions.definition || {};

        //Check values exists in the field definition
        if (!fieldDefinition.fieldOptions.definition.options) {
          return cb(new Error(`No options exist for field ${fieldDefinition.name}`));
        }

        //Finding the selected option
        var found = _.find(fieldDefinition.fieldOptions.definition.options, function(dropdownOption) {
          return dropdownOption.label === fieldValue;
        });

        //Valid option, can return
        if (found) {
          return cb();
        }

        //If the option is empty and a blank option is allowed, then that is also valid.
        if (found === "" && fieldDefinition.fieldOptions.definition.include_blank_option) {
          return cb();
        } else {
          //Otherwise, it is an invalid option
          return cb(new Error(`Invalid option specified: ${fieldValue}`));
        }
      }

      /**
       * validatorRadio - Validator function for radio fields.
       *
       * @param  {string} fieldValue        The value to validate
       * @param  {object} fieldDefinition   Full JSON definition of the field
       * @param  {array} previousFieldValues Any values previously stored with the fields
       * @param  {function} cb               Callback function
       */
      function validatorRadio(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof(fieldValue) !== "string") {
          return cb(new Error(`Expected submission to be string but got ${typeof(fieldValue)}`));
        }

        //Check value exists in the field definition
        if (!fieldDefinition.fieldOptions.definition.options) {
          return cb(new Error(`No options exist for field ${fieldDefinition.name}`));
        }

        async.some(fieldDefinition.fieldOptions.definition.options, function(dropdownOption, cb) {
          return cb(dropdownOption.label === fieldValue);
        }, function(found) {
          if (!found) {
            return cb(new Error(`Invalid option specified: ${fieldValue}`));
          } else {
            return cb();
          }
        });
      }

      function validatorCheckboxes(fieldValue, fieldDefinition, previousFieldValues, cb) {
        var minVal;

        if (fieldDefinition && fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation) {
          minVal = fieldDefinition.fieldOptions.validation.min;
        }
        var maxVal;
        if (fieldDefinition && fieldDefinition.fieldOptions && fieldDefinition.fieldOptions.validation) {
          maxVal = fieldDefinition.fieldOptions.validation.max;
        }

        if (minVal) {
          if (fieldValue.selections === null || fieldValue.selections === undefined || fieldValue.selections.length < minVal && fieldDefinition.visible) {
            var len;
            if (fieldValue.selections) {
              len = fieldValue.selections.length;
            }
            return cb(new Error(`Expected a minimum number of selections ${minVal} but got ${len}`));
          }
        }

        if (maxVal) {
          if (fieldValue.selections) {
            if (fieldValue.selections.length > maxVal) {
              return cb(new Error(`Expected a maximum number of selections ${maxVal} but got ${fieldValue.selections.length}`));
            }
          }
        }

        var optionsInCheckbox = [];

        async.eachSeries(fieldDefinition.fieldOptions.definition.options, function(choice, cb) {
          for (var choiceName in choice) { // eslint-disable-line guard-for-in
            optionsInCheckbox.push(choice[choiceName]);
          }
          return cb();
        }, function() {
          async.eachSeries(fieldValue.selections, function(selection, cb) {
            if (typeof(selection) !== "string") {
              return cb(new Error(`Expected checkbox submission to be string but got ${typeof(selection)}`));
            }

            if (optionsInCheckbox.indexOf(selection) === -1) {
              return cb(new Error(`Checkbox Option ${selection} does not exist in the field.`));
            }

            return cb();
          }, cb);
        });
      }

      function validatorLocationMap(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (fieldValue.lat && fieldValue["long"]) {
          if (isNaN(parseFloat(fieldValue.lat)) || isNaN(parseFloat(fieldValue["long"]))) {
            return cb(new Error("Invalid latitude and longitude values"));
          } else {
            return cb();
          }
        } else {
          return cb(new Error("Invalid object for locationMap submission"));
        }
      }


      function validatorLocation(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (fieldDefinition.fieldOptions.definition.locationUnit === "latlong") {
          if (fieldValue.lat && fieldValue["long"]) {
            if (isNaN(parseFloat(fieldValue.lat)) || isNaN(parseFloat(fieldValue["long"]))) {
              return cb(new Error("Invalid latitude and longitude values"));
            } else {
              return cb();
            }
          } else {
            return cb(new Error("Invalid object for latitude longitude submission"));
          }
        } else if (fieldValue.zone && fieldValue.eastings && fieldValue.northings) {
            //Zone must be 3 characters, eastings 6 and northings 9
          return validateNorthingsEastings(fieldValue, cb);
        } else {
          return cb(new Error("Invalid object for northings easting submission. Zone, Eastings and Northings elemets are required"));
        }

        function validateNorthingsEastings(fieldValue, cb) {
          if (typeof(fieldValue.zone) !== "string" || fieldValue.zone.length === 0) {
            return cb(new Error(`Invalid zone definition for northings and eastings location. ${fieldValue.zone}`));
          }

          var east = parseInt(fieldValue.eastings, 10);
          if (isNaN(east)) {
            return cb(new Error(`Invalid eastings definition for northings and eastings location. ${fieldValue.eastings}`));
          }

          var north = parseInt(fieldValue.northings, 10);
          if (isNaN(north)) {
            return cb(new Error(`Invalid northings definition for northings and eastings location. ${fieldValue.northings}`));
          }

          return cb();
        }
      }

      function validatorAnyFile(fieldValue, fieldDefinition, previousFieldValues, cb) {
        // if any of the following validators return ok, then return ok.
        validatorBase64(fieldValue, fieldDefinition, previousFieldValues, function(err) {
          if (!err) {
            return cb();
          }
          validatorFile(fieldValue, fieldDefinition, previousFieldValues, function(err) {
            if (!err) {
              return cb();
            }
            validatorFileObj(fieldValue, fieldDefinition, previousFieldValues, function(err) {
              if (!err) {
                return cb();
              }
              return cb(err);
            });
          });
        });
      }

      /**
       * Function to validate a barcode submission
       *
       * Must be an object with the following contents
       *
       * {
     *   text: "<<content of barcode>>",
     *   format: "<<barcode content format>>"
     * }
       *
       * @param fieldValue
       * @param fieldDefinition
       * @param previousFieldValues
       * @param cb
       */
      function validatorBarcode(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof(fieldValue) !== "object" || fieldValue === null) {
          return cb(new Error(`Expected object but got ${typeof(fieldValue)}`));
        }

        if (typeof(fieldValue.text) !== "string" || fieldValue.text.length === 0) {
          return cb(new Error("Expected text parameter."));
        }

        if (typeof(fieldValue.format) !== "string" || fieldValue.format.length === 0) {
          return cb(new Error("Expected format parameter."));
        }

        return cb();
      }

      function checkFileSize(fieldDefinition, fieldValue, sizeKey, cb) {
        fieldDefinition = fieldDefinition || {};
        var fieldOptions = fieldDefinition.fieldOptions || {};
        var fieldOptionsDef = fieldOptions.definition || {};
        var fileSizeMax = fieldOptionsDef.file_size || null; //FileSizeMax will be in KB. File size is in bytes

        if (fileSizeMax !== null) {
          var fieldValueSize = fieldValue[sizeKey];
          var fieldValueSizeKB = 1;
          if (fieldValueSize > 1000) {
            fieldValueSizeKB = fieldValueSize / 1000;
          }
          if (fieldValueSize > (fileSizeMax * 1000)) {
            return cb(new Error(`File size is too large. File can be a maximum of ${fileSizeMax}KB. Size of file selected: ${fieldValueSizeKB}KB`));
          } else {
            return cb();
          }
        } else {
          return cb();
        }
      }

      function validatorFile(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof fieldValue !== "object") {
          return cb(new Error(`Expected object but got ${typeof(fieldValue)}`));
        }

        var keyTypes = [
          {
            keyName: "fileName",
            valueType: "string"
          },
          {
            keyName: "fileSize",
            valueType: "number"
          },
          {
            keyName: "fileType",
            valueType: "string"
          },
          {
            keyName: "fileUpdateTime",
            valueType: "number"
          },
          {
            keyName: "hashName",
            valueType: "string"
          }
        ];

        async.each(keyTypes, function(keyType, cb) {
          var actualType = typeof fieldValue[keyType.keyName];
          if (actualType !== keyType.valueType) {
            return cb(new Error(`Expected ${keyType.valueType} but got ${actualType}`));
          }
          if (keyType.keyName === "fileName" && fieldValue[keyType.keyName].length <= 0) {
            return cb(new Error(`Expected value for ${keyType.keyName}`));
          }

          return cb();
        }, function(err) {
          if (err) {
            return cb(err);
          }

          checkFileSize(fieldDefinition, fieldValue, "fileSize", function(err) {
            if (err) {
              return cb(err);
            }

            if (fieldValue.hashName.indexOf("filePlaceHolder") > -1) { //TODO abstract out to config
              return cb();
            } else if (previousFieldValues && previousFieldValues.hashName && previousFieldValues.hashName.indexOf(fieldValue.hashName) > -1) {
              return cb();
            } else {
              return cb(new Error(`Invalid file placeholder text${fieldValue.hashName}`));
            }
          });
        });
      }

      function validatorFileObj(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if ((typeof File !== "function")) {
          return cb(new Error(`Expected File object but got ${typeof(fieldValue)}`));
        }

        var keyTypes = [
          {
            keyName: "name",
            valueType: "string"
          },
          {
            keyName: "size",
            valueType: "number"
          }
        ];

        async.each(keyTypes, function(keyType, cb) {
          var actualType = typeof fieldValue[keyType.keyName];
          if (actualType !== keyType.valueType) {
            return cb(new Error(`Expected ${keyType.valueType} but got ${actualType}`));
          }
          if (actualType === "string" && fieldValue[keyType.keyName].length <= 0) {
            return cb(new Error(`Expected value for ${keyType.keyName}`));
          }
          if (actualType === "number" && fieldValue[keyType.keyName] <= 0) {
            return cb(new Error(`Expected > 0 value for ${keyType.keyName}`));
          }

          return cb();
        }, function(err) {
          if (err) {
            return cb(err);
          }


          checkFileSize(fieldDefinition, fieldValue, "size", function(err) {
            if (err) {
              return cb(err);
            }
            return cb();
          });
        });
      }

      function validatorBase64(fieldValue, fieldDefinition, previousFieldValues, cb) {
        if (typeof fieldValue !== "string") {
          return cb(new Error(`Expected base64 string but got ${typeof(fieldValue)}`));
        }

        if (fieldValue.length <= 0) {
          return cb(new Error("Expected base64 string but was empty"));
        }

        return cb();
      }

      function validatorDateTime(fieldValue, fieldDefinition, previousFieldValues, cb) {
        var valid = false;

        if (typeof(fieldValue) !== "string") {
          return cb(new Error(`Expected string but got ${typeof(fieldValue)}`));
        }

        switch (fieldDefinition.fieldOptions.definition.datetimeUnit) {
        case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATEONLY:

          var validDateFormats = ["YYYY/MM/DD", "YYYY/MM/DD", "YYYY-MM-DD", "YYYY-MM-DD"];

          valid = _.find(validDateFormats, function(expectedFormat) {
            return moment(fieldValue, expectedFormat, true).isValid();
          });

          if (valid) {
            return cb();
          } else {
            return cb(new Error(`Invalid date value ${fieldValue}. Date format is YYYY/MM/DD`));
          }
          break; // eslint-disable-line no-unreachable
        case FIELD_TYPE_DATETIME_DATETIMEUNIT_TIMEONLY:
          valid = moment(fieldValue, "HH:mm:ss", true).isValid() || moment(fieldValue, "HH:mm", true).isValid();
          if (valid) {
            return cb();
          } else {
            return cb(new Error(`Invalid time value ${fieldValue}. Time format is HH:mm:ss or HH:mm`));
          }
          break; // eslint-disable-line no-unreachable
        case FIELD_TYPE_DATETIME_DATETIMEUNIT_DATETIME:
          var validDateTimeFormats = fieldDefinition.fieldOptions.definition.dateTimeFormat ? [fieldDefinition.fieldOptions.definition.dateTimeFormat] : ["YYYY/MM/DD HH:mm:ss", "YYYY/MM/DD HH:mm", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm"];

          valid = _.find(validDateTimeFormats, function(expectedFormat) {
            return moment(fieldValue, expectedFormat, true).isValid();
          });

          if (valid) {
            return cb();
          } else {
            return cb(new Error(`Invalid dateTime string ${fieldValue}. dateTime format is ${validDateTimeFormats.join(" or ")}`));
          }
          break; // eslint-disable-line no-unreachable
        default:
          return cb(new Error(`Invalid dateTime fieldtype ${fieldDefinition.fieldOptions.definition.datetimeUnit}`));
        }
      }

      function validatorSection(value, fieldDefinition, previousFieldValues, cb) {
        return cb(new Error(`Should not submit section field: ${fieldDefinition.name}`));
      }

      function rulesResult(rules, cb) {
        var visible = true;

        // Itterate over each rule that this field is a predicate of
        async.each(rules, function(rule, cbRule) {
          // For each rule, itterate over the predicate fields and evaluate the rule
          var predicateMapQueries = [];
          var predicateMapPassed = [];
          async.each(rule.ruleConditionalStatements, function(ruleConditionalStatement, cbPredicates) {
            var field = fieldMap[ruleConditionalStatement.sourceField];
            var passed = false;
            var submissionValues = [];
            var condition;
            var testValue;
            if (submissionFieldsMap[ruleConditionalStatement.sourceField] && submissionFieldsMap[ruleConditionalStatement.sourceField].fieldValues) {
              submissionValues = submissionFieldsMap[ruleConditionalStatement.sourceField].fieldValues;
              condition = ruleConditionalStatement.restriction;
              testValue = ruleConditionalStatement.sourceValue;

              // Validate rule predictes on the first entry only.
              passed = isConditionActive(field, submissionValues[0], testValue, condition);
            }
            predicateMapQueries.push({
              "field": field,
              "submissionValues": submissionValues,
              "condition": condition,
              "testValue": testValue,
              "passed": passed
            });

            if (passed) {
              predicateMapPassed.push(field);
            }
            return cbPredicates();
          }, function(err) {
            if (err) {
              cbRule(err);
            }

            function rulesPassed(condition, passed, queries) {
              return ((condition === "and") && ((passed.length === queries.length))) || // "and" condition - all rules must pass
                ((condition === "or") && ((passed.length > 0))); // "or" condition - only one rule must pass
            }

            /**
             * If any rule condition that targets the field/page hides that field/page, then the page is hidden.
             * Hiding the field/page takes precedence over any show. This will maintain consistency.
             * E.g. if x is y then show p1,p2 takes precendence over if x is z then hide p1, p2
             */
            if (rulesPassed(rule.ruleConditionalOperator, predicateMapPassed, predicateMapQueries)) {
              visible = (rule.type === "show") && visible;
            } else {
              visible = (rule.type !== "show") && visible;
            }

            return cbRule();
          });
        }, function(err) {
          if (err) {
            return cb(err);
          }

          return cb(undefined, visible);
        });
      }

      function isPageVisible(pageId, cb) {
        init();
        if (isPageRuleSubject(pageId)) { // if the page is the target of a rule
          return rulesResult(pageRuleSubjectMap[pageId], cb); // execute page rules
        } else {
          return cb(undefined, true); // if page is not subject of any rule then must be visible
        }
      }

      function isFieldVisible(fieldId, checkContainingPage, cb) {
        /*
         * fieldId = Id of field to check for reule predeciate references
         * checkContainingPage = if true check page containing field, and return false if the page is hidden
         */
        init();
        // Fields are visable by default
        var field = fieldMap[fieldId];

        /**
         * If the field is an admin field, the rules engine returns an error, as admin fields cannot be the subject of rules engine actions.
         */
        if (adminFieldMap[fieldId]) {
          return cb(new Error(`Submission ${fieldId} is an admin field. Admin fields cannot be passed to the rules engine.`));
        } else if (!field) {
          return cb(new Error("Field does not exist in form"));
        }

        async.waterfall([

          function testPage(cb) {
            if (checkContainingPage) {
              isPageVisible(field.pageId, cb);
            } else {
              return cb(undefined, true);
            }
          },
          function testField(pageVisible, cb) {
            if (!pageVisible) { // if page containing field is not visible then don't need to check field
              return cb(undefined, false);
            }

            if (isFieldRuleSubject(fieldId)) { // If the field is the subject of a rule it may have been hidden
              return rulesResult(fieldRuleSubjectMap[fieldId], cb); // execute field rules
            } else {
              return cb(undefined, true); // if not subject of field rules then can't be hidden
            }
          }
        ], cb);
      }

      /*
       * check all rules actions
       *      res:
       *      {
       *          "actions": {
       *              "pages": {
       *                  "targetId": {
       *                      "targetId": "",
       *                      "action": "show|hide"
       *                  }
       *              },
       *              "fields": {
       *              }
       *          }
       *      }
       */
      function checkRules(submissionJSON, cb) {
        init();
        var err = initSubmission(submissionJSON);
        if (err) {
          return cb(err);
        }
        var actions = {};

        async.parallel([

          function(cb) {
            actions.fields = {};
            async.eachSeries(Object.keys(fieldRuleSubjectMap), function(fieldId, cb) {
              isFieldVisible(fieldId, false, function(err, fieldVisible) {
                if (err) {
                  return cb(err);
                }
                actions.fields[fieldId] = {
                  targetId: fieldId,
                  action: (fieldVisible ? "show" : "hide")
                };
                return cb();
              });
            }, cb);
          },
          function(cb) {
            actions.pages = {};
            async.eachSeries(Object.keys(pageRuleSubjectMap), function(pageId, cb) {
              isPageVisible(pageId, function(err, pageVisible) {
                if (err) {
                  return cb(err);
                }
                actions.pages[pageId] = {
                  targetId: pageId,
                  action: (pageVisible ? "show" : "hide")
                };
                return cb();
              });
            }, cb);
          }
        ], function(err) {
          if (err) {
            return cb(err);
          }

          return cb(undefined, {
            actions: actions
          });
        });
      }

      function isConditionActive(field, fieldValue, testValue, condition) {

        var fieldType = field.type;
        var fieldOptions = field.fieldOptions ? field.fieldOptions : {};

        if (typeof(fieldValue) === 'undefined' || fieldValue === null) {
          return false;
        }

        if (typeof(fieldValueComparison[fieldType]) === "function") {
          return fieldValueComparison[fieldType](fieldValue, testValue, condition, fieldOptions);
        } else {
          return false;
        }

      }

      function isNumberBetween(num, min, max) {
        var numVal = parseInt(num, 10);
        return (!isNaN(numVal) && (numVal >= min) && (numVal <= max));
      }

      return {
        validateForm: validateForm,
        validateField: validateField,
        validateFieldValue: validateFieldValue,
        checkRules: checkRules,

        // The following are used internally, but exposed for tests
        validateFieldInternal: validateFieldInternal,
        initSubmission: initSubmission,
        isFieldVisible: isFieldVisible,
        isConditionActive: isConditionActive
      };
    };

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = formsRulesEngine;
    }

    /*globals appForm */
    if (typeof appForm !== 'undefined') {
      appForm.RulesEngine = formsRulesEngine;
    }
  }());

},{"async":2,"moment":4,"underscore":5}],2:[function(require,module,exports) {
  (function(process) {
    /*global setImmediate: false, setTimeout: false, console: false */
    (function() {

      var async = {};

      // global on the server, window in the browser
      var root, previous_async;

      root = this;
      if (root != null) {
        previous_async = root.async;
      }

      async.noConflict = function() {
        root.async = previous_async;
        return async;
      };

      function only_once(fn) {
        var called = false;
        return function() {
          if (called) throw new Error("Callback was already called.");
          called = true;
          fn.apply(root, arguments);
        };
      }

      //// cross-browser compatiblity functions ////

      var _each = function(arr, iterator) {
        if (arr.forEach) {
          return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
          iterator(arr[i], i, arr);
        }
      };

      var _map = function(arr, iterator) {
        if (arr.map) {
          return arr.map(iterator);
        }
        var results = [];
        _each(arr, function(x, i, a) {
          results.push(iterator(x, i, a));
        });
        return results;
      };

      var _reduce = function(arr, iterator, memo) {
        if (arr.reduce) {
          return arr.reduce(iterator, memo);
        }
        _each(arr, function(x, i, a) {
          memo = iterator(memo, x, i, a);
        });
        return memo;
      };

      var _keys = function(obj) {
        if (Object.keys) {
          return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
          if (obj.hasOwnProperty(k)) {
            keys.push(k);
          }
        }
        return keys;
      };

      //// exported async module functions ////

      //// nextTick implementation with browser-compatible fallback ////
      if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
          async.nextTick = function(fn) {
            // not a direct alias for IE10 compatibility
            setImmediate(fn);
          };
          async.setImmediate = async.nextTick;
        }        else {
          async.nextTick = function(fn) {
            setTimeout(fn, 0);
          };
          async.setImmediate = async.nextTick;
        }
      }      else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
          async.setImmediate = setImmediate;
        }        else {
          async.setImmediate = async.nextTick;
        }
      }

      async.each = function(arr, iterator, callback) {
        callback = callback || function() {};
        if (!arr.length) {
          return callback();
        }
        var completed = 0;
        _each(arr, function(x) {
          iterator(x, only_once(function(err) {
            if (err) {
              callback(err);
              callback = function() {};
            }            else {
              completed += 1;
              if (completed >= arr.length) {
                callback(null);
              }
            }
          }));
        });
      };
      async.forEach = async.each;

      async.eachSeries = function(arr, iterator, callback) {
        callback = callback || function() {};
        if (!arr.length) {
          return callback();
        }
        var completed = 0;
        var iterate = function() {
          iterator(arr[completed], function(err) {
            if (err) {
              callback(err);
              callback = function() {};
            }            else {
              completed += 1;
              if (completed >= arr.length) {
                callback(null);
              }              else {
                iterate();
              }
            }
          });
        };
        iterate();
      };
      async.forEachSeries = async.eachSeries;

      async.eachLimit = function(arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
      };
      async.forEachLimit = async.eachLimit;

      var _eachLimit = function(limit) {

        return function(arr, iterator, callback) {
          callback = callback || function() {};
          if (!arr.length || limit <= 0) {
            return callback();
          }
          var completed = 0;
          var started = 0;
          var running = 0;

          (function replenish() {
            if (completed >= arr.length) {
              return callback();
            }

            while (running < limit && started < arr.length) {
              started += 1;
              running += 1;
              iterator(arr[started - 1], function(err) {
                if (err) {
                  callback(err);
                  callback = function() {};
                }                else {
                  completed += 1;
                  running -= 1;
                  if (completed >= arr.length) {
                    callback();
                  }                  else {
                    replenish();
                  }
                }
              });
            }
          })();
        };
      };


      var doParallel = function(fn) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          return fn.apply(null, [async.each].concat(args));
        };
      };
      var doParallelLimit = function(limit, fn) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
      };
      var doSeries = function(fn) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          return fn.apply(null, [async.eachSeries].concat(args));
        };
      };


      var _asyncMap = function(eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function(x, i) {
          return {index: i, value: x};
        });
        eachfn(arr, function(x, callback) {
          iterator(x.value, function(err, v) {
            results[x.index] = v;
            callback(err);
          });
        }, function(err) {
          callback(err, results);
        });
      };
      async.map = doParallel(_asyncMap);
      async.mapSeries = doSeries(_asyncMap);
      async.mapLimit = function(arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
      };

      var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
      };

      // reduce only has a series version, as doing reduce in parallel won't
      // work in many situations.
      async.reduce = function(arr, memo, iterator, callback) {
        async.eachSeries(arr, function(x, callback) {
          iterator(memo, x, function(err, v) {
            memo = v;
            callback(err);
          });
        }, function(err) {
          callback(err, memo);
        });
      };
      // inject alias
      async.inject = async.reduce;
      // foldl alias
      async.foldl = async.reduce;

      async.reduceRight = function(arr, memo, iterator, callback) {
        var reversed = _map(arr, function(x) {
          return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
      };
      // foldr alias
      async.foldr = async.reduceRight;

      var _filter = function(eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function(x, i) {
          return {index: i, value: x};
        });
        eachfn(arr, function(x, callback) {
          iterator(x.value, function(v) {
            if (v) {
              results.push(x);
            }
            callback();
          });
        }, function(err) {
          callback(_map(results.sort(function(a, b) {
            return a.index - b.index;
          }), function(x) {
            return x.value;
          }));
        });
      };
      async.filter = doParallel(_filter);
      async.filterSeries = doSeries(_filter);
      // select alias
      async.select = async.filter;
      async.selectSeries = async.filterSeries;

      var _reject = function(eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function(x, i) {
          return {index: i, value: x};
        });
        eachfn(arr, function(x, callback) {
          iterator(x.value, function(v) {
            if (!v) {
              results.push(x);
            }
            callback();
          });
        }, function(err) {
          callback(_map(results.sort(function(a, b) {
            return a.index - b.index;
          }), function(x) {
            return x.value;
          }));
        });
      };
      async.reject = doParallel(_reject);
      async.rejectSeries = doSeries(_reject);

      var _detect = function(eachfn, arr, iterator, main_callback) {
        eachfn(arr, function(x, callback) {
          iterator(x, function(result) {
            if (result) {
              main_callback(x);
              main_callback = function() {};
            }            else {
              callback();
            }
          });
        }, function(err) {
          main_callback();
        });
      };
      async.detect = doParallel(_detect);
      async.detectSeries = doSeries(_detect);

      async.some = function(arr, iterator, main_callback) {
        async.each(arr, function(x, callback) {
          iterator(x, function(v) {
            if (v) {
              main_callback(true);
              main_callback = function() {};
            }
            callback();
          });
        }, function(err) {
          main_callback(false);
        });
      };
      // any alias
      async.any = async.some;

      async.every = function(arr, iterator, main_callback) {
        async.each(arr, function(x, callback) {
          iterator(x, function(v) {
            if (!v) {
              main_callback(false);
              main_callback = function() {};
            }
            callback();
          });
        }, function(err) {
          main_callback(true);
        });
      };
      // all alias
      async.all = async.every;

      async.sortBy = function(arr, iterator, callback) {
        async.map(arr, function(x, callback) {
          iterator(x, function(err, criteria) {
            if (err) {
              callback(err);
            }            else {
              callback(null, {value: x, criteria: criteria});
            }
          });
        }, function(err, results) {
          if (err) {
            return callback(err);
          }          else {
            var fn = function(left, right) {
              var a = left.criteria, b = right.criteria;
              return a < b ? -1 : a > b ? 1 : 0;
            };
            callback(null, _map(results.sort(fn), function(x) {
              return x.value;
            }));
          }
        });
      };

      async.auto = function(tasks, callback) {
        callback = callback || function() {};
        var keys = _keys(tasks);
        if (!keys.length) {
          return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function(fn) {
          listeners.unshift(fn);
        };
        var removeListener = function(fn) {
          for (var i = 0; i < listeners.length; i += 1) {
            if (listeners[i] === fn) {
              listeners.splice(i, 1);
              return;
            }
          }
        };
        var taskComplete = function() {
          _each(listeners.slice(0), function(fn) {
            fn();
          });
        };

        addListener(function() {
          if (_keys(results).length === keys.length) {
            callback(null, results);
            callback = function() {};
          }
        });

        _each(keys, function(k) {
          var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
          var taskCallback = function(err) {
            var args = Array.prototype.slice.call(arguments, 1);
            if (args.length <= 1) {
              args = args[0];
            }
            if (err) {
              var safeResults = {};
              _each(_keys(results), function(rkey) {
                safeResults[rkey] = results[rkey];
              });
              safeResults[k] = args;
              callback(err, safeResults);
              // stop subsequent errors hitting callback multiple times
              callback = function() {};
            }            else {
              results[k] = args;
              async.setImmediate(taskComplete);
            }
          };
          var requires = task.slice(0, Math.abs(task.length - 1)) || [];
          var ready = function() {
            return _reduce(requires, function(a, x) {
              return (a && results.hasOwnProperty(x));
            }, true) && !results.hasOwnProperty(k);
          };
          if (ready()) {
            task[task.length - 1](taskCallback, results);
          }          else {
            var listener = function() {
              if (ready()) {
                removeListener(listener);
                task[task.length - 1](taskCallback, results);
              }
            };
            addListener(listener);
          }
        });
      };

      async.waterfall = function(tasks, callback) {
        callback = callback || function() {};
        if (tasks.constructor !== Array) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
          return callback();
        }
        var wrapIterator = function(iterator) {
          return function(err) {
            if (err) {
              callback.apply(null, arguments);
              callback = function() {};
            }            else {
              var args = Array.prototype.slice.call(arguments, 1);
              var next = iterator.next();
              if (next) {
                args.push(wrapIterator(next));
              }              else {
                args.push(callback);
              }
              async.setImmediate(function() {
                iterator.apply(null, args);
              });
            }
          };
        };
        wrapIterator(async.iterator(tasks))();
      };

      var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function() {};
        if (tasks.constructor === Array) {
          eachfn.map(tasks, function(fn, callback) {
            if (fn) {
              fn(function(err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                  args = args[0];
                }
                callback.call(null, err, args);
              });
            }
          }, callback);
        }        else {
          var results = {};
          eachfn.each(_keys(tasks), function(k, callback) {
            tasks[k](function(err) {
              var args = Array.prototype.slice.call(arguments, 1);
              if (args.length <= 1) {
                args = args[0];
              }
              results[k] = args;
              callback(err);
            });
          }, function(err) {
            callback(err, results);
          });
        }
      };

      async.parallel = function(tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
      };

      async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
      };

      async.series = function(tasks, callback) {
        callback = callback || function() {};
        if (tasks.constructor === Array) {
          async.mapSeries(tasks, function(fn, callback) {
            if (fn) {
              fn(function(err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                  args = args[0];
                }
                callback.call(null, err, args);
              });
            }
          }, callback);
        }        else {
          var results = {};
          async.eachSeries(_keys(tasks), function(k, callback) {
            tasks[k](function(err) {
              var args = Array.prototype.slice.call(arguments, 1);
              if (args.length <= 1) {
                args = args[0];
              }
              results[k] = args;
              callback(err);
            });
          }, function(err) {
            callback(err, results);
          });
        }
      };

      async.iterator = function(tasks) {
        var makeCallback = function(index) {
          var fn = function() {
            if (tasks.length) {
              tasks[index].apply(null, arguments);
            }
            return fn.next();
          };
          fn.next = function() {
            return (index < tasks.length - 1) ? makeCallback(index + 1): null;
          };
          return fn;
        };
        return makeCallback(0);
      };

      async.apply = function(fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function() {
          return fn.apply(
            null, args.concat(Array.prototype.slice.call(arguments))
          );
        };
      };

      var _concat = function(eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function(x, cb) {
          fn(x, function(err, y) {
            r = r.concat(y || []);
            cb(err);
          });
        }, function(err) {
          callback(err, r);
        });
      };
      async.concat = doParallel(_concat);
      async.concatSeries = doSeries(_concat);

      async.whilst = function(test, iterator, callback) {
        if (test()) {
          iterator(function(err) {
            if (err) {
              return callback(err);
            }
            async.whilst(test, iterator, callback);
          });
        }        else {
          callback();
        }
      };

      async.doWhilst = function(iterator, test, callback) {
        iterator(function(err) {
          if (err) {
            return callback(err);
          }
          if (test()) {
            async.doWhilst(iterator, test, callback);
          }          else {
            callback();
          }
        });
      };

      async.until = function(test, iterator, callback) {
        if (!test()) {
          iterator(function(err) {
            if (err) {
              return callback(err);
            }
            async.until(test, iterator, callback);
          });
        }        else {
          callback();
        }
      };

      async.doUntil = function(iterator, test, callback) {
        iterator(function(err) {
          if (err) {
            return callback(err);
          }
          if (!test()) {
            async.doUntil(iterator, test, callback);
          }          else {
            callback();
          }
        });
      };

      async.queue = function(worker, concurrency) {
        if (concurrency === undefined) {
          concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if (data.constructor !== Array) {
            data = [data];
          }
          _each(data, function(task) {
            var item = {
              data: task,
              callback: typeof callback === 'function' ? callback : null
            };

            if (pos) {
              q.tasks.unshift(item);
            } else {
              q.tasks.push(item);
            }

            if (q.saturated && q.tasks.length === concurrency) {
              q.saturated();
            }
            async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
          tasks: [],
          concurrency: concurrency,
          saturated: null,
          empty: null,
          drain: null,
          push: function(data, callback) {
            _insert(q, data, false, callback);
          },
          unshift: function(data, callback) {
            _insert(q, data, true, callback);
          },
          process: function() {
            if (workers < q.concurrency && q.tasks.length) {
              var task = q.tasks.shift();
              if (q.empty && q.tasks.length === 0) {
                q.empty();
              }
              workers += 1;
              var next = function() {
                workers -= 1;
                if (task.callback) {
                  task.callback.apply(task, arguments);
                }
                if (q.drain && q.tasks.length + workers === 0) {
                  q.drain();
                }
                q.process();
              };
              var cb = only_once(next);
              worker(task.data, cb);
            }
          },
          length: function() {
            return q.tasks.length;
          },
          running: function() {
            return workers;
          }
        };
        return q;
      };

      async.cargo = function(worker, payload) {
        var working     = false,
          tasks       = [];

        var cargo = {
          tasks: tasks,
          payload: payload,
          saturated: null,
          empty: null,
          drain: null,
          push: function(data, callback) {
            if (data.constructor !== Array) {
              data = [data];
            }
            _each(data, function(task) {
              tasks.push({
                data: task,
                callback: typeof callback === 'function' ? callback : null
              });
              if (cargo.saturated && tasks.length === payload) {
                cargo.saturated();
              }
            });
            async.setImmediate(cargo.process);
          },
          process: function process() {
            if (working) return;
            if (tasks.length === 0) {
              if (cargo.drain) cargo.drain();
              return;
            }

            var ts = typeof payload === 'number'
              ? tasks.splice(0, payload)
              : tasks.splice(0);

            var ds = _map(ts, function(task) {
              return task.data;
            });

            if (cargo.empty) cargo.empty();
            working = true;
            worker(ds, function() {
              working = false;

              var args = arguments;
              _each(ts, function(data) {
                if (data.callback) {
                  data.callback.apply(null, args);
                }
              });

              process();
            });
          },
          length: function() {
            return tasks.length;
          },
          running: function() {
            return working;
          }
        };
        return cargo;
      };

      var _console_fn = function(name) {
        return function(fn) {
          var args = Array.prototype.slice.call(arguments, 1);
          fn.apply(null, args.concat([function(err) {
            var args = Array.prototype.slice.call(arguments, 1);
            if (typeof console !== 'undefined') {
              if (err) {
                if (console.error) {
                  console.error(err);
                }
              }              else if (console[name]) {
                _each(args, function(x) {
                  console[name](x);
                });
              }
            }
          }]));
        };
      };
      async.log = _console_fn('log');
      async.dir = _console_fn('dir');
      /*async.info = _console_fn('info');
       async.warn = _console_fn('warn');
       async.error = _console_fn('error');*/

      async.memoize = function(fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function(x) {
          return x;
        };
        var memoized = function() {
          var args = Array.prototype.slice.call(arguments);
          var callback = args.pop();
          var key = hasher.apply(null, args);
          if (key in memo) {
            callback.apply(null, memo[key]);
          }          else if (key in queues) {
            queues[key].push(callback);
          }          else {
            queues[key] = [callback];
            fn.apply(null, args.concat([function() {
              memo[key] = arguments;
              var q = queues[key];
              delete queues[key];
              for (var i = 0, l = q.length; i < l; i++) {
                q[i].apply(null, arguments);
              }
            }]));
          }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
      };

      async.unmemoize = function(fn) {
        return function() {
          return (fn.unmemoized || fn).apply(null, arguments);
        };
      };

      async.times = function(count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
          counter.push(i);
        }
        return async.map(counter, iterator, callback);
      };

      async.timesSeries = function(count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
          counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
      };

      async.compose = function(/* functions... */) {
        var fns = Array.prototype.reverse.call(arguments);
        return function() {
          var that = this;
          var args = Array.prototype.slice.call(arguments);
          var callback = args.pop();
          async.reduce(fns, args, function(newargs, fn, cb) {
            fn.apply(that, newargs.concat([function() {
              var err = arguments[0];
              var nextargs = Array.prototype.slice.call(arguments, 1);
              cb(err, nextargs);
            }]));
          },
            function(err, results) {
              callback.apply(that, [err].concat(results));
            });
        };
      };

      var _applyEach = function(eachfn, fns /*args...*/) {
        var go = function() {
          var that = this;
          var args = Array.prototype.slice.call(arguments);
          var callback = args.pop();
          return eachfn(fns, function(fn, cb) {
            fn.apply(that, args.concat([cb]));
          },
            callback);
        };
        if (arguments.length > 2) {
          var args = Array.prototype.slice.call(arguments, 2);
          return go.apply(this, args);
        }        else {
          return go;
        }
      };
      async.applyEach = doParallel(_applyEach);
      async.applyEachSeries = doSeries(_applyEach);

      async.forever = function(fn, callback) {
        function next(err) {
          if (err) {
            if (callback) {
              return callback(err);
            }
            throw err;
          }
          fn(next);
        }
        next();
      };

      // AMD / RequireJS
      if (typeof define !== 'undefined' && define.amd) {
        define([], function() {
          return async;
        });
      }
      // Node.js
      else if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
      }
      // included directly via <script> tag
      else {
        root.async = async;
      }

    }());

  }).call(this,require('_process'));
},{"_process":3}],3:[function(require,module,exports) {
// shim for using process in browser

  var process = module.exports = {};
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;

  function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
      queue = currentQueue.concat(queue);
    } else {
      queueIndex = -1;
    }
    if (queue.length) {
      drainQueue();
    }
  }

  function drainQueue() {
    if (draining) {
      return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      while (++queueIndex < len) {
        if (currentQueue) {
          currentQueue[queueIndex].run();
        }
      }
      queueIndex = -1;
      len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
  }

  process.nextTick = function(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        args[i - 1] = arguments[i];
      }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
      setTimeout(drainQueue, 0);
    }
  };

// v8 likes predictible objects
  function Item(fun, array) {
    this.fun = fun;
    this.array = array;
  }
  Item.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = ''; // empty string to avoid regexp issues
  process.versions = {};

  function noop() {}

  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;

  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };

  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };

},{}],4:[function(require,module,exports) {
  (function(global) {
//! moment.js
//! version : 2.6.0
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

    (function(undefined) {

      /************************************
       Constants
       ************************************/

      var moment,
        VERSION = "2.6.0",
      // the global-scope this is NOT the global object in Node.js
        globalScope = typeof global !== 'undefined' ? global : this,
        oldGlobalMoment,
        round = Math.round,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

      // internal storage for language config files
        languages = {},

      // moment internal properties
        momentProperties = {
          _isAMomentObject: null,
          _i : null,
          _f : null,
          _l : null,
          _strict : null,
          _isUTC : null,
          _offset : null,  // optional. Combine with _isUTC
          _pf : null,
          _lang : null  // optional
        },

      // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

      // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

      // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
      // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

      // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

      // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
        parseTokenOrdinal = /\d{1,2}/,

      //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

      // iso 8601 regex
      // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
          ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
          ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
          ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
          ['GGGG-[W]WW', /\d{4}-W\d{2}/],
          ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

      // iso time formats and regexes
        isoTimes = [
          ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
          ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
          ['HH:mm', /(T| )\d\d:\d\d/],
          ['HH', /(T| )\d\d/]
        ],

      // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

      // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
          'Milliseconds' : 1,
          'Seconds' : 1e3,
          'Minutes' : 6e4,
          'Hours' : 36e5,
          'Days' : 864e5,
          'Months' : 2592e6,
          'Years' : 31536e6
        },

        unitAliases = {
          ms : 'millisecond',
          s : 'second',
          m : 'minute',
          h : 'hour',
          d : 'day',
          D : 'date',
          w : 'week',
          W : 'isoWeek',
          M : 'month',
          Q : 'quarter',
          y : 'year',
          DDD : 'dayOfYear',
          e : 'weekday',
          E : 'isoWeekday',
          gg: 'weekYear',
          GG: 'isoWeekYear'
        },

        camelFunctions = {
          dayofyear : 'dayOfYear',
          isoweekday : 'isoWeekday',
          isoweek : 'isoWeek',
          weekyear : 'weekYear',
          isoweekyear : 'isoWeekYear'
        },

      // format function strings
        formatFunctions = {},

      // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
          M    : function() {
            return this.month() + 1;
          },
          MMM  : function(format) {
            return this.lang().monthsShort(this, format);
          },
          MMMM : function(format) {
            return this.lang().months(this, format);
          },
          D    : function() {
            return this.date();
          },
          DDD  : function() {
            return this.dayOfYear();
          },
          d    : function() {
            return this.day();
          },
          dd   : function(format) {
            return this.lang().weekdaysMin(this, format);
          },
          ddd  : function(format) {
            return this.lang().weekdaysShort(this, format);
          },
          dddd : function(format) {
            return this.lang().weekdays(this, format);
          },
          w    : function() {
            return this.week();
          },
          W    : function() {
            return this.isoWeek();
          },
          YY   : function() {
            return leftZeroFill(this.year() % 100, 2);
          },
          YYYY : function() {
            return leftZeroFill(this.year(), 4);
          },
          YYYYY : function() {
            return leftZeroFill(this.year(), 5);
          },
          YYYYYY : function() {
            var y = this.year(), sign = y >= 0 ? '+' : '-';
            return sign + leftZeroFill(Math.abs(y), 6);
          },
          gg   : function() {
            return leftZeroFill(this.weekYear() % 100, 2);
          },
          gggg : function() {
            return leftZeroFill(this.weekYear(), 4);
          },
          ggggg : function() {
            return leftZeroFill(this.weekYear(), 5);
          },
          GG   : function() {
            return leftZeroFill(this.isoWeekYear() % 100, 2);
          },
          GGGG : function() {
            return leftZeroFill(this.isoWeekYear(), 4);
          },
          GGGGG : function() {
            return leftZeroFill(this.isoWeekYear(), 5);
          },
          e : function() {
            return this.weekday();
          },
          E : function() {
            return this.isoWeekday();
          },
          a    : function() {
            return this.lang().meridiem(this.hours(), this.minutes(), true);
          },
          A    : function() {
            return this.lang().meridiem(this.hours(), this.minutes(), false);
          },
          H    : function() {
            return this.hours();
          },
          h    : function() {
            return this.hours() % 12 || 12;
          },
          m    : function() {
            return this.minutes();
          },
          s    : function() {
            return this.seconds();
          },
          S    : function() {
            return toInt(this.milliseconds() / 100);
          },
          SS   : function() {
            return leftZeroFill(toInt(this.milliseconds() / 10), 2);
          },
          SSS  : function() {
            return leftZeroFill(this.milliseconds(), 3);
          },
          SSSS : function() {
            return leftZeroFill(this.milliseconds(), 3);
          },
          Z    : function() {
            var a = -this.zone(),
              b = "+";
            if (a < 0) {
              a = -a;
              b = "-";
            }
            return `${b + leftZeroFill(toInt(a / 60), 2)}:${leftZeroFill(toInt(a) % 60, 2)}`;
          },
          ZZ   : function() {
            var a = -this.zone(),
              b = "+";
            if (a < 0) {
              a = -a;
              b = "-";
            }
            return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
          },
          z : function() {
            return this.zoneAbbr();
          },
          zz : function() {
            return this.zoneName();
          },
          X    : function() {
            return this.unix();
          },
          Q : function() {
            return this.quarter();
          }
        },

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'];

      function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
          empty : false,
          unusedTokens : [],
          unusedInput : [],
          overflow : -2,
          charsLeftOver : 0,
          nullInput : false,
          invalidMonth : null,
          invalidFormat : false,
          userInvalidated : false,
          iso: false
        };
      }

      function deprecate(msg, fn) {
        var firstTime = true;
        function printMsg() {
          if (moment.suppressDeprecationWarnings === false &&
            typeof console !== 'undefined' && console.warn) {
            console.warn(`Deprecation warning: ${msg}`);
          }
        }
        return extend(function() {
          if (firstTime) {
            printMsg();
            firstTime = false;
          }
          return fn.apply(this, arguments);
        }, fn);
      }

      function padToken(func, count) {
        return function(a) {
          return leftZeroFill(func.call(this, a), count);
        };
      }
      function ordinalizeToken(func, period) {
        return function(a) {
          return this.lang().ordinal(func.call(this, a), period);
        };
      }

      while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[`${i}o`] = ordinalizeToken(formatTokenFunctions[i], i);
      }
      while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
      }
      formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


      /************************************
       Constructors
       ************************************/

      function Language() {

      }

      // Moment prototype object
      function Moment(config) {
        checkOverflow(config);
        extend(this, config);
      }

      // Duration Constructor
      function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
          years = normalizedInput.year || 0,
          quarters = normalizedInput.quarter || 0,
          months = normalizedInput.month || 0,
          weeks = normalizedInput.week || 0,
          days = normalizedInput.day || 0,
          hours = normalizedInput.hour || 0,
          minutes = normalizedInput.minute || 0,
          seconds = normalizedInput.second || 0,
          milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
          seconds * 1e3 + // 1000
          minutes * 6e4 + // 1000 * 60
          hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
          weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
          quarters * 3 +
          years * 12;

        this._data = {};

        this._bubble();
      }

      /************************************
       Helpers
       ************************************/


      function extend(a, b) {
        for (var i in b) {
          if (b.hasOwnProperty(i)) {
            a[i] = b[i];
          }
        }

        if (b.hasOwnProperty("toString")) {
          a.toString = b.toString;
        }

        if (b.hasOwnProperty("valueOf")) {
          a.valueOf = b.valueOf;
        }

        return a;
      }

      function cloneMoment(m) {
        var result = {}, i;
        for (i in m) {
          if (m.hasOwnProperty(i) && momentProperties.hasOwnProperty(i)) {
            result[i] = m[i];
          }
        }

        return result;
      }

      function absRound(number) {
        if (number < 0) {
          return Math.ceil(number);
        } else {
          return Math.floor(number);
        }
      }

      // left zero fill a number
      // see http://jsperf.com/left-zero-filling for performance comparison
      function leftZeroFill(number, targetLength, forceSign) {
        var output = `${Math.abs(number)}`,
          sign = number >= 0;

        while (output.length < targetLength) {
          output = `0${output}`;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
      }

      // helper function for _.addTime and _.subtractTime
      function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
          days = duration._days,
          months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
          mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
          rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
          rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
          moment.updateOffset(mom, days || months);
        }
      }

      // check if is an array
      function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
      }

      function isDate(input) {
        return  Object.prototype.toString.call(input) === '[object Date]' ||
          input instanceof Date;
      }

      // compare two arrays, return the number of differences
      function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
          lengthDiff = Math.abs(array1.length - array2.length),
          diffs = 0,
          i;
        for (i = 0; i < len; i++) {
          if ((dontConvert && array1[i] !== array2[i]) ||
            (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
            diffs++;
          }
        }
        return diffs + lengthDiff;
      }

      function normalizeUnits(units) {
        if (units) {
          var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
          units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
      }

      function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
          normalizedProp,
          prop;

        for (prop in inputObject) {
          if (inputObject.hasOwnProperty(prop)) {
            normalizedProp = normalizeUnits(prop);
            if (normalizedProp) {
              normalizedInput[normalizedProp] = inputObject[prop];
            }
          }
        }

        return normalizedInput;
      }

      function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
          count = 7;
          setter = 'day';
        }        else if (field.indexOf('month') === 0) {
          count = 12;
          setter = 'month';
        }        else {
          return;
        }

        moment[field] = function(format, index) {
          var i, getter,
            method = moment.fn._lang[field],
            results = [];

          if (typeof format === 'number') {
            index = format;
            format = undefined;
          }

          getter = function(i) {
            var m = moment().utc().set(setter, i);
            return method.call(moment.fn._lang, m, format || '');
          };

          if (index != null) {
            return getter(index);
          }          else {
            for (i = 0; i < count; i++) {
              results.push(getter(i));
            }
            return results;
          }
        };
      }

      function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
          value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
          if (coercedNumber >= 0) {
            value = Math.floor(coercedNumber);
          } else {
            value = Math.ceil(coercedNumber);
          }
        }

        return value;
      }

      function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      }

      function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
      }

      function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
      }

      function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      }

      function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
          overflow =
            m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
              m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 23 ? HOUR :
                  m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                    m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                      m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                        -1;

          if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
            overflow = DATE;
          }

          m._pf.overflow = overflow;
        }
      }

      function isValid(m) {
        if (m._isValid == null) {
          m._isValid = !isNaN(m._d.getTime()) &&
            m._pf.overflow < 0 &&
            !m._pf.empty &&
            !m._pf.invalidMonth &&
            !m._pf.nullInput &&
            !m._pf.invalidFormat &&
            !m._pf.userInvalidated;

          if (m._strict) {
            m._isValid = m._isValid &&
              m._pf.charsLeftOver === 0 &&
              m._pf.unusedTokens.length === 0;
          }
        }
        return m._isValid;
      }

      function normalizeLanguage(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
      }

      // Return a moment from input, that is local/utc/zone equivalent to model.
      function makeAs(input, model) {
        return model._isUTC ? moment(input).zone(model._offset || 0) :
          moment(input).local();
      }

      /************************************
       Languages
       ************************************/


      extend(Language.prototype, {

        set : function(config) {
          var prop, i;
          for (i in config) {
            prop = config[i];
            if (typeof prop === 'function') {
              this[i] = prop;
            } else {
              this[`_${i}`] = prop;
            }
          }
        },

        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        months : function(m) {
          return this._months[m.month()];
        },

        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        monthsShort : function(m) {
          return this._monthsShort[m.month()];
        },

        monthsParse : function(monthName) {
          var i, mom, regex;

          if (!this._monthsParse) {
            this._monthsParse = [];
          }

          for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            if (!this._monthsParse[i]) {
              mom = moment.utc([2000, i]);
              regex = `^${this.months(mom, '')}|^${this.monthsShort(mom, '')}`;
              this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (this._monthsParse[i].test(monthName)) {
              return i;
            }
          }
        },

        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdays : function(m) {
          return this._weekdays[m.day()];
        },

        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysShort : function(m) {
          return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        weekdaysMin : function(m) {
          return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function(weekdayName) {
          var i, mom, regex;

          if (!this._weekdaysParse) {
            this._weekdaysParse = [];
          }

          for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already
            if (!this._weekdaysParse[i]) {
              mom = moment([2000, 1]).day(i);
              regex = `^${this.weekdays(mom, '')}|^${this.weekdaysShort(mom, '')}|^${this.weekdaysMin(mom, '')}`;
              this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (this._weekdaysParse[i].test(weekdayName)) {
              return i;
            }
          }
        },

        _longDateFormat : {
          LT : "h:mm A",
          L : "MM/DD/YYYY",
          LL : "MMMM D YYYY",
          LLL : "MMMM D YYYY LT",
          LLLL : "dddd, MMMM D YYYY LT"
        },
        longDateFormat : function(key) {
          var output = this._longDateFormat[key];
          if (!output && this._longDateFormat[key.toUpperCase()]) {
            output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function(val) {
              return val.slice(1);
            });
            this._longDateFormat[key] = output;
          }
          return output;
        },

        isPM : function(input) {
          // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
          // Using charAt should be more compatible.
          return ((`${input}`).toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function(hours, minutes, isLower) {
          if (hours > 11) {
            return isLower ? 'pm' : 'PM';
          } else {
            return isLower ? 'am' : 'AM';
          }
        },

        _calendar : {
          sameDay : '[Today at] LT',
          nextDay : '[Tomorrow at] LT',
          nextWeek : 'dddd [at] LT',
          lastDay : '[Yesterday at] LT',
          lastWeek : '[Last] dddd [at] LT',
          sameElse : 'L'
        },
        calendar : function(key, mom) {
          var output = this._calendar[key];
          return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
          future : "in %s",
          past : "%s ago",
          s : "a few seconds",
          m : "a minute",
          mm : "%d minutes",
          h : "an hour",
          hh : "%d hours",
          d : "a day",
          dd : "%d days",
          M : "a month",
          MM : "%d months",
          y : "a year",
          yy : "%d years"
        },
        relativeTime : function(number, withoutSuffix, string, isFuture) {
          var output = this._relativeTime[string];
          return (typeof output === 'function') ?
            output(number, withoutSuffix, string, isFuture) :
            output.replace(/%d/i, number);
        },
        pastFuture : function(diff, output) {
          var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
          return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function(number) {
          return this._ordinal.replace("%d", number);
        },
        _ordinal : "%d",

        preparse : function(string) {
          return string;
        },

        postformat : function(string) {
          return string;
        },

        week : function(mom) {
          return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
          dow : 0, // Sunday is the first day of the week.
          doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        _invalidDate: 'Invalid date',
        invalidDate: function() {
          return this._invalidDate;
        }
      });

      // Loads a language definition into the `languages` cache.  The function
      // takes a key and optionally values.  If not in the browser and no values
      // are provided, it will load the language file module.  As a convenience,
      // this function also returns the language values.
      function loadLang(key, values) {
        values.abbr = key;
        if (!languages[key]) {
          languages[key] = new Language();
        }
        languages[key].set(values);
        return languages[key];
      }

      // Remove a language from the `languages` cache. Mostly useful in tests.
      function unloadLang(key) {
        delete languages[key];
      }

      // Determines which language definition to use and returns it.
      //
      // With no parameters, it will return the global language.  If you
      // pass in a language key, such as 'en', it will return the
      // definition for 'en', so long as 'en' has already been loaded using
      // moment.lang.
      function getLangDefinition(key) {
        var i = 0, j, lang, next, split,
          get = function(k) {
            if (!languages[k] && hasModule) {
              try {
                require(`./lang/${k}`);
              } catch (e) { }
            }
            return languages[k];
          };

        if (!key) {
          return moment.fn._lang;
        }

        if (!isArray(key)) {
          //short-circuit everything else
          lang = get(key);
          if (lang) {
            return lang;
          }
          key = [key];
        }

        //pick the language from the array
        //try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
        //substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
        while (i < key.length) {
          split = normalizeLanguage(key[i]).split('-');
          j = split.length;
          next = normalizeLanguage(key[i + 1]);
          next = next ? next.split('-') : null;
          while (j > 0) {
            lang = get(split.slice(0, j).join('-'));
            if (lang) {
              return lang;
            }
            if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
              //the next array item is better than a shallower substring of this one
              break;
            }
            j--;
          }
          i++;
        }
        return moment.fn._lang;
      }

      /************************************
       Formatting
       ************************************/


      function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
          return input.replace(/^\[|\]$/g, "");
        }
        return input.replace(/\\/g, "");
      }

      function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
          if (formatTokenFunctions[array[i]]) {
            array[i] = formatTokenFunctions[array[i]];
          } else {
            array[i] = removeFormattingTokens(array[i]);
          }
        }

        return function(mom) {
          var output = "";
          for (i = 0; i < length; i++) {
            output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
          }
          return output;
        };
      }

      // format date using native date object
      function formatMoment(m, format) {

        if (!m.isValid()) {
          return m.lang().invalidDate();
        }

        format = expandFormat(format, m.lang());

        if (!formatFunctions[format]) {
          formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
      }

      function expandFormat(format, lang) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
          return lang.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
          format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
          localFormattingTokens.lastIndex = 0;
          i -= 1;
        }

        return format;
      }


      /************************************
       Parsing
       ************************************/


      // get the regex to find the next token
      function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
          return parseTokenOneDigit;
        case 'DDDD':
          return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
          return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
          return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
          return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
          if (strict) {
            return parseTokenOneDigit;
          }
          /* falls through */
        case 'SS':
          if (strict) {
            return parseTokenTwoDigits;
          }
          /* falls through */
        case 'SSS':
          if (strict) {
            return parseTokenThreeDigits;
          }
          /* falls through */
        case 'DDD':
          return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
          return parseTokenWord;
        case 'a':
        case 'A':
          return getLangDefinition(config._l)._meridiemParse;
        case 'X':
          return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
          return parseTokenTimezone;
        case 'T':
          return parseTokenT;
        case 'SSSS':
          return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
          return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
          return parseTokenOneOrTwoDigits;
        case 'Do':
          return parseTokenOrdinal;
        default :
          a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), "i"));
          return a;
        }
      }

      function timezoneMinutesFromString(string) {
        string = string || "";
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
          tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
          parts = (`${tzChunk}`).match(parseTimezoneChunker) || ['-', 0, 0],
          minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? -minutes : minutes;
      }

      // function to convert string input to date
      function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
          // QUARTER
        case 'Q':
          if (input != null) {
            datePartArray[MONTH] = (toInt(input) - 1) * 3;
          }
          break;
          // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
          if (input != null) {
            datePartArray[MONTH] = toInt(input) - 1;
          }
          break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
          a = getLangDefinition(config._l).monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
          if (a != null) {
            datePartArray[MONTH] = a;
          } else {
            config._pf.invalidMonth = input;
          }
          break;
          // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
          if (input != null) {
            datePartArray[DATE] = toInt(input);
          }
          break;
        case 'Do' :
          if (input != null) {
            datePartArray[DATE] = toInt(parseInt(input, 10));
          }
          break;
          // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
          if (input != null) {
            config._dayOfYear = toInt(input);
          }

          break;
          // YEAR
        case 'YY' :
          datePartArray[YEAR] = moment.parseTwoDigitYear(input);
          break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
          datePartArray[YEAR] = toInt(input);
          break;
          // AM / PM
        case 'a' : // fall through to A
        case 'A' :
          config._isPm = getLangDefinition(config._l).isPM(input);
          break;
          // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
          datePartArray[HOUR] = toInt(input);
          break;
          // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
          datePartArray[MINUTE] = toInt(input);
          break;
          // SECOND
        case 's' : // fall through to ss
        case 'ss' :
          datePartArray[SECOND] = toInt(input);
          break;
          // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
          datePartArray[MILLISECOND] = toInt((`0.${input}`) * 1000);
          break;
          // UNIX TIMESTAMP WITH MS
        case 'X':
          config._d = new Date(parseFloat(input) * 1000);
          break;
          // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
          config._useUTC = true;
          config._tzm = timezoneMinutesFromString(input);
          break;
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'dd':
        case 'ddd':
        case 'dddd':
        case 'e':
        case 'E':
          token = token.substr(0, 1);
          /* falls through */
        case 'gg':
        case 'gggg':
        case 'GG':
        case 'GGGG':
        case 'GGGGG':
          token = token.substr(0, 2);
          if (input) {
            config._w = config._w || {};
            config._w[token] = input;
          }
          break;
        }
      }

      // convert an array to a date.
      // the array should mirror the parameters below
      // note: all values past the year are optional and will default to the lowest possible value.
      // [year, month, day , hour, minute, second, millisecond]
      function dateFromConfig(config) {
        var i, date, input = [], currentDate,
          yearToUse, fixYear, w, temp, lang, weekday, week;

        if (config._d) {
          return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
          fixYear = function(val) {
            var intVal = parseInt(val, 10);
            return val ?
              (val.length < 3 ? (intVal > 68 ? 1900 + intVal : 2000 + intVal) : intVal) :
              (config._a[YEAR] == null ? moment().weekYear() : config._a[YEAR]);
          };

          w = config._w;
          if (w.GG != null || w.W != null || w.E != null) {
            temp = dayOfYearFromWeeks(fixYear(w.GG), w.W || 1, w.E, 4, 1);
          }          else {
            lang = getLangDefinition(config._l);
            weekday = w.d != null ?  parseWeekday(w.d, lang) :
              (w.e != null ?  parseInt(w.e, 10) + lang._week.dow : 0);

            week = parseInt(w.w, 10) || 1;

            //if we're parsing 'd', then the low day numbers may be next week
            if (w.d != null && weekday < lang._week.dow) {
              week++;
            }

            temp = dayOfYearFromWeeks(fixYear(w.gg), week, weekday, lang._week.doy, lang._week.dow);
          }

          config._a[YEAR] = temp.year;
          config._dayOfYear = temp.dayOfYear;
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
          yearToUse = config._a[YEAR] == null ? currentDate[YEAR] : config._a[YEAR];

          if (config._dayOfYear > daysInYear(yearToUse)) {
            config._pf._overflowDayOfYear = true;
          }

          date = makeUTCDate(yearToUse, 0, config._dayOfYear);
          config._a[MONTH] = date.getUTCMonth();
          config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
          config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
          config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid
        input[HOUR] += toInt((config._tzm || 0) / 60);
        input[MINUTE] += toInt((config._tzm || 0) % 60);

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
      }

      function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
          return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
          normalizedInput.year,
          normalizedInput.month,
          normalizedInput.day,
          normalizedInput.hour,
          normalizedInput.minute,
          normalizedInput.second,
          normalizedInput.millisecond
        ];

        dateFromConfig(config);
      }

      function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
          return [
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
          ];
        } else {
          return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
      }

      // date from string and format string
      function makeDateFromStringAndFormat(config) {

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var lang = getLangDefinition(config._l),
          string = `${config._i}`,
          i, parsedInput, tokens, token, skipped,
          stringLength = string.length,
          totalParsedInputLength = 0;

        tokens = expandFormat(config._f, lang).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
          token = tokens[i];
          parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
          if (parsedInput) {
            skipped = string.substr(0, string.indexOf(parsedInput));
            if (skipped.length > 0) {
              config._pf.unusedInput.push(skipped);
            }
            string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            totalParsedInputLength += parsedInput.length;
          }
          // don't parse if it's not a known token
          if (formatTokenFunctions[token]) {
            if (parsedInput) {
              config._pf.empty = false;
            }            else {
              config._pf.unusedTokens.push(token);
            }
            addTimeToArrayFromToken(token, parsedInput, config);
          }          else if (config._strict && !parsedInput) {
            config._pf.unusedTokens.push(token);
          }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
          config._pf.unusedInput.push(string);
        }

        // handle am pm
        if (config._isPm && config._a[HOUR] < 12) {
          config._a[HOUR] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[HOUR] === 12) {
          config._a[HOUR] = 0;
        }

        dateFromConfig(config);
        checkOverflow(config);
      }

      function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function(matched, p1, p2, p3, p4) {
          return p1 || p2 || p3 || p4;
        });
      }

      // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
      function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      }

      // date from string and array of format strings
      function makeDateFromStringAndArray(config) {
        var tempConfig,
          bestMoment,

          scoreToBeat,
          i,
          currentScore;

        if (config._f.length === 0) {
          config._pf.invalidFormat = true;
          config._d = new Date(NaN);
          return;
        }

        for (i = 0; i < config._f.length; i++) {
          currentScore = 0;
          tempConfig = extend({}, config);
          tempConfig._pf = defaultParsingFlags();
          tempConfig._f = config._f[i];
          makeDateFromStringAndFormat(tempConfig);

          if (!isValid(tempConfig)) {
            continue;
          }

          // if there is any input that was not parsed add a penalty for that format
          currentScore += tempConfig._pf.charsLeftOver;

          //or tokens
          currentScore += tempConfig._pf.unusedTokens.length * 10;

          tempConfig._pf.score = currentScore;

          if (scoreToBeat == null || currentScore < scoreToBeat) {
            scoreToBeat = currentScore;
            bestMoment = tempConfig;
          }
        }

        extend(config, bestMoment || tempConfig);
      }

      // date from iso format
      function makeDateFromString(config) {
        var i, l,
          string = config._i,
          match = isoRegex.exec(string);

        if (match) {
          config._pf.iso = true;
          for (i = 0, l = isoDates.length; i < l; i++) {
            if (isoDates[i][1].exec(string)) {
              // match[5] should be "T" or undefined
              config._f = isoDates[i][0] + (match[6] || " ");
              break;
            }
          }
          for (i = 0, l = isoTimes.length; i < l; i++) {
            if (isoTimes[i][1].exec(string)) {
              config._f += isoTimes[i][0];
              break;
            }
          }
          if (string.match(parseTokenTimezone)) {
            config._f += "Z";
          }
          makeDateFromStringAndFormat(config);
        }        else {
          moment.createFromInputFallback(config);
        }
      }

      function makeDateFromInput(config) {
        var input = config._i,
          matched = aspNetJsonRegex.exec(input);

        if (input === undefined) {
          config._d = new Date();
        } else if (matched) {
          config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
          makeDateFromString(config);
        } else if (isArray(input)) {
          config._a = input.slice(0);
          dateFromConfig(config);
        } else if (isDate(input)) {
          config._d = new Date(+input);
        } else if (typeof(input) === 'object') {
          dateFromObject(config);
        } else if (typeof(input) === 'number') {
          // from milliseconds
          config._d = new Date(input);
        } else {
          moment.createFromInputFallback(config);
        }
      }

      function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
          date.setFullYear(y);
        }
        return date;
      }

      function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
          date.setUTCFullYear(y);
        }
        return date;
      }

      function parseWeekday(input, language) {
        if (typeof input === 'string') {
          if (!isNaN(input)) {
            input = parseInt(input, 10);
          }          else {
            input = language.weekdaysParse(input);
            if (typeof input !== 'number') {
              return null;
            }
          }
        }
        return input;
      }

      /************************************
       Relative Time
       ************************************/


      // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
      function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
      }

      function relativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
          minutes = round(seconds / 60),
          hours = round(minutes / 60),
          days = round(hours / 24),
          years = round(days / 365),
          args = seconds < 45 && ['s', seconds] ||
            minutes === 1 && ['m'] ||
            minutes < 45 && ['mm', minutes] ||
            hours === 1 && ['h'] ||
            hours < 22 && ['hh', hours] ||
            days === 1 && ['d'] ||
            days <= 25 && ['dd', days] ||
            days <= 45 && ['M'] ||
            days < 345 && ['MM', round(days / 30)] ||
            years === 1 && ['y'] || ['yy', years];
        args[2] = withoutSuffix;
        args[3] = milliseconds > 0;
        args[4] = lang;
        return substituteTimeAgo.apply({}, args);
      }


      /************************************
       Week of Year
       ************************************/


      // firstDayOfWeek       0 = sun, 6 = sat
      //                      the day of the week that starts the week
      //                      (usually sunday or monday)
      // firstDayOfWeekOfYear 0 = sun, 6 = sat
      //                      the first week is the week that contains the first
      //                      of this day of the week
      //                      (eg. ISO weeks use thursday (4))
      function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
          daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
          adjustedMoment;


        if (daysToDayOfWeek > end) {
          daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
          daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);
        return {
          week: Math.ceil(adjustedMoment.dayOfYear() / 7),
          year: adjustedMoment.year()
        };
      }

      //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
      function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
          year: dayOfYear > 0 ? year : year - 1,
          dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
      }

      /************************************
       Top Level Functions
       ************************************/

      function makeMoment(config) {
        var input = config._i,
          format = config._f;

        if (input === null || (format === undefined && input === '')) {
          return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
          config._i = input = getLangDefinition().preparse(input);
        }

        if (moment.isMoment(input)) {
          config = cloneMoment(input);

          config._d = new Date(+input._d);
        } else if (format) {
          if (isArray(format)) {
            makeDateFromStringAndArray(config);
          } else {
            makeDateFromStringAndFormat(config);
          }
        } else {
          makeDateFromInput(config);
        }

        return new Moment(config);
      }

      moment = function(input, format, lang, strict) {
        var c;

        if (typeof(lang) === "boolean") {
          strict = lang;
          lang = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = lang;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
      };

      moment.suppressDeprecationWarnings = false;

      moment.createFromInputFallback = deprecate(
        "moment construction falls back to js Date. This is " +
        "discouraged and will be removed in upcoming major " +
        "release. Please refer to " +
        "https://github.com/moment/moment/issues/1407 for more info.",
        function(config) {
          config._d = new Date(config._i);
        });

      // creating with utc
      moment.utc = function(input, format, lang, strict) {
        var c;

        if (typeof(lang) === "boolean") {
          strict = lang;
          lang = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = lang;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
      };

      // creating with unix timestamp (in seconds)
      moment.unix = function(input) {
        return moment(input * 1000);
      };

      // duration
      moment.duration = function(input, key) {
        var duration = input,
        // matching against regexp is expensive, do it on demand
          match = null,
          sign,
          ret,
          parseIso;

        if (moment.isDuration(input)) {
          duration = {
            ms: input._milliseconds,
            d: input._days,
            M: input._months
          };
        } else if (typeof input === 'number') {
          duration = {};
          if (key) {
            duration[key] = input;
          } else {
            duration.milliseconds = input;
          }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
          sign = (match[1] === "-") ? -1 : 1;
          duration = {
            y: 0,
            d: toInt(match[DATE]) * sign,
            h: toInt(match[HOUR]) * sign,
            m: toInt(match[MINUTE]) * sign,
            s: toInt(match[SECOND]) * sign,
            ms: toInt(match[MILLISECOND]) * sign
          };
        } else if (!!(match = isoDurationRegex.exec(input))) {
          sign = (match[1] === "-") ? -1 : 1;
          parseIso = function(inp) {
            // We'd normally use ~~inp for this, but unfortunately it also
            // converts floats to ints.
            // inp may be undefined, so careful calling replace on it.
            var res = inp && parseFloat(inp.replace(',', '.'));
            // apply sign while we're at it
            return (isNaN(res) ? 0 : res) * sign;
          };
          duration = {
            y: parseIso(match[2]),
            M: parseIso(match[3]),
            d: parseIso(match[4]),
            h: parseIso(match[5]),
            m: parseIso(match[6]),
            s: parseIso(match[7]),
            w: parseIso(match[8])
          };
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && input.hasOwnProperty('_lang')) {
          ret._lang = input._lang;
        }

        return ret;
      };

      // version number
      moment.version = VERSION;

      // default format
      moment.defaultFormat = isoFormat;

      // Plugins that add properties should also add the key here (null value),
      // so we can properly clone ourselves.
      moment.momentProperties = momentProperties;

      // This function will be called whenever a moment is mutated.
      // It is intended to keep the offset in sync with the timezone.
      moment.updateOffset = function() {};

      // This function will load languages and then set the global language.  If
      // no arguments are passed in, it will simply return the current global
      // language key.
      moment.lang = function(key, values) {
        var r;
        if (!key) {
          return moment.fn._lang._abbr;
        }
        if (values) {
          loadLang(normalizeLanguage(key), values);
        } else if (values === null) {
          unloadLang(key);
          key = 'en';
        } else if (!languages[key]) {
          getLangDefinition(key);
        }
        r = moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);
        return r._abbr;
      };

      // returns language data
      moment.langData = function(key) {
        if (key && key._lang && key._lang._abbr) {
          key = key._lang._abbr;
        }
        return getLangDefinition(key);
      };

      // compare moment object
      moment.isMoment = function(obj) {
        return obj instanceof Moment ||
          (obj != null &&  obj.hasOwnProperty('_isAMomentObject'));
      };

      // for typechecking Duration objects
      moment.isDuration = function(obj) {
        return obj instanceof Duration;
      };

      for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
      }

      moment.normalizeUnits = function(units) {
        return normalizeUnits(units);
      };

      moment.invalid = function(flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
          extend(m._pf, flags);
        }        else {
          m._pf.userInvalidated = true;
        }

        return m;
      };

      moment.parseZone = function() {
        return moment.apply(null, arguments).parseZone();
      };

      moment.parseTwoDigitYear = function(input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
      };

      /************************************
       Moment Prototype
       ************************************/


      extend(moment.fn = Moment.prototype, {

        clone : function() {
          return moment(this);
        },

        valueOf : function() {
          return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function() {
          return Math.floor(+this / 1000);
        },

        toString : function() {
          return this.clone().lang('en').format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function() {
          return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function() {
          var m = moment(this).utc();
          if (0 < m.year() && m.year() <= 9999) {
            return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
          } else {
            return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
          }
        },

        toArray : function() {
          var m = this;
          return [
            m.year(),
            m.month(),
            m.date(),
            m.hours(),
            m.minutes(),
            m.seconds(),
            m.milliseconds()
          ];
        },

        isValid : function() {
          return isValid(this);
        },

        isDSTShifted : function() {

          if (this._a) {
            return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
          }

          return false;
        },

        parsingFlags : function() {
          return extend({}, this._pf);
        },

        invalidAt: function() {
          return this._pf.overflow;
        },

        utc : function() {
          return this.zone(0);
        },

        local : function() {
          this.zone(0);
          this._isUTC = false;
          return this;
        },

        format : function(inputString) {
          var output = formatMoment(this, inputString || moment.defaultFormat);
          return this.lang().postformat(output);
        },

        add : function(input, val) {
          var dur;
          // switch args to support add('s', 1) and add(1, 's')
          if (typeof input === 'string') {
            dur = moment.duration(+val, input);
          } else {
            dur = moment.duration(input, val);
          }
          addOrSubtractDurationFromMoment(this, dur, 1);
          return this;
        },

        subtract : function(input, val) {
          var dur;
          // switch args to support subtract('s', 1) and subtract(1, 's')
          if (typeof input === 'string') {
            dur = moment.duration(+val, input);
          } else {
            dur = moment.duration(input, val);
          }
          addOrSubtractDurationFromMoment(this, dur, -1);
          return this;
        },

        diff : function(input, units, asFloat) {
          var that = makeAs(input, this),
            zoneDiff = (this.zone() - that.zone()) * 6e4,
            diff, output;

          units = normalizeUnits(units);

          if (units === 'year' || units === 'month') {
            // average number of days in the months in the given dates
            diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
            // difference in months
            output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
            // adjust by taking difference in days, average number of days
            // and dst in the given months.
            output += ((this - moment(this).startOf('month')) -
              (that - moment(that).startOf('month'))) / diff;
            // same as above but with zones, to negate all dst
            output -= ((this.zone() - moment(this).startOf('month').zone()) -
              (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
            if (units === 'year') {
              output = output / 12;
            }
          } else {
            diff = (this - that);
            output = units === 'second' ? diff / 1e3 : // 1000
              units === 'minute' ? diff / 6e4 : // 1000 * 60
                units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                  units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                      diff;
          }
          return asFloat ? output : absRound(output);
        },

        from : function(time, withoutSuffix) {
          return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);
        },

        fromNow : function(withoutSuffix) {
          return this.from(moment(), withoutSuffix);
        },

        calendar : function() {
          // We want to compare the start of today, vs this.
          // Getting start-of-today depends on whether we're zone'd or not.
          var sod = makeAs(moment(), this).startOf('day'),
            diff = this.diff(sod, 'days', true),
            format = diff < -6 ? 'sameElse' :
              diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                  diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                      diff < 7 ? 'nextWeek' : 'sameElse';
          return this.format(this.lang().calendar(format, this));
        },

        isLeapYear : function() {
          return isLeapYear(this.year());
        },

        isDST : function() {
          return (this.zone() < this.clone().month(0).zone() ||
          this.zone() < this.clone().month(5).zone());
        },

        day : function(input) {
          var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
          if (input != null) {
            input = parseWeekday(input, this.lang());
            return this.add({ d : input - day });
          } else {
            return day;
          }
        },

        month : makeAccessor('Month', true),

        startOf: function(units) {
          units = normalizeUnits(units);
          // the following switch intentionally omits break keywords
          // to utilize falling through the cases.
          switch (units) {
          case 'year':
            this.month(0);
            /* falls through */
          case 'quarter':
          case 'month':
            this.date(1);
            /* falls through */
          case 'week':
          case 'isoWeek':
          case 'day':
            this.hours(0);
            /* falls through */
          case 'hour':
            this.minutes(0);
            /* falls through */
          case 'minute':
            this.seconds(0);
            /* falls through */
          case 'second':
            this.milliseconds(0);
            /* falls through */
          }

          // weeks are a special case
          if (units === 'week') {
            this.weekday(0);
          } else if (units === 'isoWeek') {
            this.isoWeekday(1);
          }

          // quarters are also special
          if (units === 'quarter') {
            this.month(Math.floor(this.month() / 3) * 3);
          }

          return this;
        },

        endOf: function(units) {
          units = normalizeUnits(units);
          return this.startOf(units).add((units === 'isoWeek' ? 'week' : units), 1).subtract('ms', 1);
        },

        isAfter: function(input, units) {
          units = typeof units !== 'undefined' ? units : 'millisecond';
          return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function(input, units) {
          units = typeof units !== 'undefined' ? units : 'millisecond';
          return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function(input, units) {
          units = units || 'ms';
          return +this.clone().startOf(units) === +makeAs(input, this).startOf(units);
        },

        min: function(other) {
          other = moment.apply(null, arguments);
          return other < this ? this : other;
        },

        max: function(other) {
          other = moment.apply(null, arguments);
          return other > this ? this : other;
        },

        // keepTime = true means only change the timezone, without affecting
        // the local hour. So 5:31:26 +0300 --[zone(2, true)]--> 5:31:26 +0200
        // It is possible that 5:31:26 doesn't exist int zone +0200, so we
        // adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        zone : function(input, keepTime) {
          var offset = this._offset || 0;
          if (input != null) {
            if (typeof input === "string") {
              input = timezoneMinutesFromString(input);
            }
            if (Math.abs(input) < 16) {
              input = input * 60;
            }
            this._offset = input;
            this._isUTC = true;
            if (offset !== input) {
              if (!keepTime || this._changeInProgress) {
                addOrSubtractDurationFromMoment(this,
                  moment.duration(offset - input, 'm'), 1, false);
              } else if (!this._changeInProgress) {
                this._changeInProgress = true;
                moment.updateOffset(this, true);
                this._changeInProgress = null;
              }
            }
          } else {
            return this._isUTC ? offset : this._d.getTimezoneOffset();
          }
          return this;
        },

        zoneAbbr : function() {
          return this._isUTC ? "UTC" : "";
        },

        zoneName : function() {
          return this._isUTC ? "Coordinated Universal Time" : "";
        },

        parseZone : function() {
          if (this._tzm) {
            this.zone(this._tzm);
          } else if (typeof this._i === 'string') {
            this.zone(this._i);
          }
          return this;
        },

        hasAlignedHourOffset : function(input) {
          if (!input) {
            input = 0;
          }          else {
            input = moment(input).zone();
          }

          return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function() {
          return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function(input) {
          var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
          return input == null ? dayOfYear : this.add("d", (input - dayOfYear));
        },

        quarter : function(input) {
          return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function(input) {
          var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;
          return input == null ? year : this.add("y", (input - year));
        },

        isoWeekYear : function(input) {
          var year = weekOfYear(this, 1, 4).year;
          return input == null ? year : this.add("y", (input - year));
        },

        week : function(input) {
          var week = this.lang().week(this);
          return input == null ? week : this.add("d", (input - week) * 7);
        },

        isoWeek : function(input) {
          var week = weekOfYear(this, 1, 4).week;
          return input == null ? week : this.add("d", (input - week) * 7);
        },

        weekday : function(input) {
          var weekday = (this.day() + 7 - this.lang()._week.dow) % 7;
          return input == null ? weekday : this.add("d", input - weekday);
        },

        isoWeekday : function(input) {
          // behaves the same as moment#day except
          // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
          // as a setter, sunday should belong to the previous week.
          return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function() {
          return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function() {
          var weekInfo = this._lang._week;
          return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function(units) {
          units = normalizeUnits(units);
          return this[units]();
        },

        set : function(units, value) {
          units = normalizeUnits(units);
          if (typeof this[units] === 'function') {
            this[units](value);
          }
          return this;
        },

        // If passed a language key, it will set the language for this
        // instance.  Otherwise, it will return the language configuration
        // variables for this instance.
        lang : function(key) {
          if (key === undefined) {
            return this._lang;
          } else {
            this._lang = getLangDefinition(key);
            return this;
          }
        }
      });

      function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
          value = mom.lang().monthsParse(value);
          // TODO: Another silent failure?
          if (typeof value !== 'number') {
            return mom;
          }
        }

        dayOfMonth = Math.min(mom.date(),
          daysInMonth(mom.year(), value));
        mom._d[`set${mom._isUTC ? 'UTC' : ''}Month`](value, dayOfMonth);
        return mom;
      }

      function rawGetter(mom, unit) {
        return mom._d[`get${mom._isUTC ? 'UTC' : ''}${unit}`]();
      }

      function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
          return rawMonthSetter(mom, value);
        } else {
          return mom._d[`set${mom._isUTC ? 'UTC' : ''}${unit}`](value);
        }
      }

      function makeAccessor(unit, keepTime) {
        return function(value) {
          if (value != null) {
            rawSetter(this, unit, value);
            moment.updateOffset(this, keepTime);
            return this;
          } else {
            return rawGetter(this, unit);
          }
        };
      }

      moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
      moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
      moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
      // Setting the hour should keep the time, because the user explicitly
      // specified which hour he wants. So trying to maintain the same hour (in
      // a new timezone) makes sense. Adding/subtracting hours does not follow
      // this rule.
      moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
      // moment.fn.month is defined separately
      moment.fn.date = makeAccessor('Date', true);
      moment.fn.dates = deprecate("dates accessor is deprecated. Use date instead.", makeAccessor('Date', true));
      moment.fn.year = makeAccessor('FullYear', true);
      moment.fn.years = deprecate("years accessor is deprecated. Use year instead.", makeAccessor('FullYear', true));

      // add plural methods
      moment.fn.days = moment.fn.day;
      moment.fn.months = moment.fn.month;
      moment.fn.weeks = moment.fn.week;
      moment.fn.isoWeeks = moment.fn.isoWeek;
      moment.fn.quarters = moment.fn.quarter;

      // add aliased format methods
      moment.fn.toJSON = moment.fn.toISOString;

      /************************************
       Duration Prototype
       ************************************/


      extend(moment.duration.fn = Duration.prototype, {

        _bubble : function() {
          var milliseconds = this._milliseconds,
            days = this._days,
            months = this._months,
            data = this._data,
            seconds, minutes, hours, years;

          // The following code bubbles up values, see the tests for
          // examples of what that means.
          data.milliseconds = milliseconds % 1000;

          seconds = absRound(milliseconds / 1000);
          data.seconds = seconds % 60;

          minutes = absRound(seconds / 60);
          data.minutes = minutes % 60;

          hours = absRound(minutes / 60);
          data.hours = hours % 24;

          days += absRound(hours / 24);
          data.days = days % 30;

          months += absRound(days / 30);
          data.months = months % 12;

          years = absRound(months / 12);
          data.years = years;
        },

        weeks : function() {
          return absRound(this.days() / 7);
        },

        valueOf : function() {
          return this._milliseconds +
            this._days * 864e5 +
            (this._months % 12) * 2592e6 +
            toInt(this._months / 12) * 31536e6;
        },

        humanize : function(withSuffix) {
          var difference = +this,
            output = relativeTime(difference, !withSuffix, this.lang());

          if (withSuffix) {
            output = this.lang().pastFuture(difference, output);
          }

          return this.lang().postformat(output);
        },

        add : function(input, val) {
          // supports only 2.0-style add(1, 's') or add(moment)
          var dur = moment.duration(input, val);

          this._milliseconds += dur._milliseconds;
          this._days += dur._days;
          this._months += dur._months;

          this._bubble();

          return this;
        },

        subtract : function(input, val) {
          var dur = moment.duration(input, val);

          this._milliseconds -= dur._milliseconds;
          this._days -= dur._days;
          this._months -= dur._months;

          this._bubble();

          return this;
        },

        get : function(units) {
          units = normalizeUnits(units);
          return this[`${units.toLowerCase()}s`]();
        },

        as : function(units) {
          units = normalizeUnits(units);
          return this[`as${units.charAt(0).toUpperCase()}${units.slice(1)}s`]();
        },

        lang : moment.fn.lang,

        toIsoString : function() {
          // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
          var years = Math.abs(this.years()),
            months = Math.abs(this.months()),
            days = Math.abs(this.days()),
            hours = Math.abs(this.hours()),
            minutes = Math.abs(this.minutes()),
            seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

          if (!this.asSeconds()) {
            // this is the same as C#'s (Noda) and python (isodate)...
            // but not other JS (goog.date)
            return 'P0D';
          }

          return `${this.asSeconds() < 0 ? '-' : ''
            }P${
            years ? `${years}Y` : ''
            }${months ? `${months}M` : ''
            }${days ? `${days}D` : ''
            }${(hours || minutes || seconds) ? 'T' : ''
            }${hours ? `${hours}H` : ''
            }${minutes ? `${minutes}M` : ''
            }${seconds ? `${seconds}S` : ''}`;
        }
      });

      function makeDurationGetter(name) {
        moment.duration.fn[name] = function() {
          return this._data[name];
        };
      }

      function makeDurationAsGetter(name, factor) {
        moment.duration.fn[`as${name}`] = function() {
          return +this / factor;
        };
      }

      for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
          makeDurationAsGetter(i, unitMillisecondFactors[i]);
          makeDurationGetter(i.toLowerCase());
        }
      }

      makeDurationAsGetter('Weeks', 6048e5);
      moment.duration.fn.asMonths = function() {
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;
      };


      /************************************
       Default Lang
       ************************************/


        // Set default language, other languages will inherit from English.
      moment.lang('en', {
        ordinal : function(number) {
          var b = number % 10,
            output = (toInt(number % 100 / 10) === 1) ? 'th' :
              (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                  (b === 3) ? 'rd' : 'th';
          return number + output;
        }
      });

      /* EMBED_LANGUAGES */

      /************************************
       Exposing Moment
       ************************************/

      function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
          return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
          globalScope.moment = deprecate(
            "Accessing Moment through the global scope is " +
            "deprecated, and will be removed in an upcoming " +
            "release.",
            moment);
        } else {
          globalScope.moment = moment;
        }
      }

      // CommonJS module is defined
      if (hasModule) {
        module.exports = moment;
      } else if (typeof define === "function" && define.amd) {
        define("moment", function(require, exports, module) {
          if (module.config && module.config() && module.config().noGlobal === true) {
            // release the global variable
            globalScope.moment = oldGlobalMoment;
          }

          return moment;
        });
        makeGlobal(true);
      } else {
        makeGlobal();
      }
    }).call(this);

  }).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
},{}],5:[function(require,module,exports) {
//     Underscore.js 1.8.0
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

  (function() {

    // Baseline setup
    // --------------

    // Establish the root object, `window` in the browser, or `exports` on the server.
    var root = this;

    // Save the previous value of the `_` variable.
    var previousUnderscore = root._;

    // Save bytes in the minified (but not gzipped) version:
    var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

    // Create quick reference variables for speed access to core prototypes.
    var
      push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

    // All **ECMAScript 5** native function implementations that we hope to use
    // are declared here.
    var
      nativeIsArray      = Array.isArray,
      nativeKeys         = Object.keys,
      nativeBind         = FuncProto.bind,
      nativeCreate       = Object.create;

    // Reusable constructor function for prototype setting.
    var Ctor = function() {};

    // Create a safe reference to the Underscore object for use below.
    var _ = function(obj) {
      if (obj instanceof _) return obj;
      if (!(this instanceof _)) return new _(obj);
      this._wrapped = obj;
    };

    // Export the Underscore object for **Node.js**, with
    // backwards-compatibility for the old `require()` API. If we're in
    // the browser, add `_` as a global object.
    if (typeof exports !== 'undefined') {
      if (typeof module !== 'undefined' && module.exports) {
        exports = module.exports = _;
      }
      exports._ = _;
    } else {
      root._ = _;
    }

    // Current version.
    _.VERSION = '1.8.0';

    // Internal function that returns an efficient (for current engines) version
    // of the passed-in callback, to be repeatedly applied in other Underscore
    // functions.
    var optimizeCb = function(func, context, argCount) {
      if (context === void 0) return func;
      switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
      }
      return function() {
        return func.apply(context, arguments);
      };
    };

    // A mostly-internal function to generate callbacks that can be applied
    // to each element in a collection, returning the desired result — either
    // identity, an arbitrary callback, a property matcher, or a property accessor.
    var cb = function(value, context, argCount) {
      if (value == null) return _.identity;
      if (_.isFunction(value)) return optimizeCb(value, context, argCount);
      if (_.isObject(value)) return _.matcher(value);
      return _.property(value);
    };
    _.iteratee = function(value, context) {
      return cb(value, context, Infinity);
    };

    // An internal function for creating assigner functions.
    var createAssigner = function(keysFunc, undefinedOnly) {
      return function(obj) {
        var length = arguments.length;
        if (length < 2 || obj == null) return obj;
        for (var index = 1; index < length; index++) {
          var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
          for (var i = 0; i < l; i++) {
            var key = keys[i];
            if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key];
          }
        }
        return obj;
      };
    };

    // An internal function for creating a new object that inherits from another.
    var baseCreate = function(prototype) {
      if (!_.isObject(prototype)) return {};
      if (nativeCreate) return nativeCreate(prototype);
      Ctor.prototype = prototype;
      var result = new Ctor;
      Ctor.prototype = null;
      return result;
    };

    // Helper for collection methods to determine whether a collection
    // should be iterated as an array or as an object
    // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
    var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
    var isArrayLike = function(collection) {
      var length = collection && collection.length;
      return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
    };

    // Collection Functions
    // --------------------

    // The cornerstone, an `each` implementation, aka `forEach`.
    // Handles raw objects in addition to array-likes. Treats all
    // sparse array-likes as if they were dense.
    _.each = _.forEach = function(obj, iteratee, context) {
      iteratee = optimizeCb(iteratee, context);
      var i, length;
      if (isArrayLike(obj)) {
        for (i = 0, length = obj.length; i < length; i++) {
          iteratee(obj[i], i, obj);
        }
      } else {
        var keys = _.keys(obj);
        for (i = 0, length = keys.length; i < length; i++) {
          iteratee(obj[keys[i]], keys[i], obj);
        }
      }
      return obj;
    };

    // Return the results of applying the iteratee to each element.
    _.map = _.collect = function(obj, iteratee, context) {
      iteratee = cb(iteratee, context);
      var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
      for (var index = 0; index < length; index++) {
        var currentKey = keys ? keys[index] : index;
        results[index] = iteratee(obj[currentKey], currentKey, obj);
      }
      return results;
    };

    // Create a reducing function iterating left or right.
    function createReduce(dir) {
      // Optimized iterator function as using arguments.length
      // in the main function will deoptimize the, see #1991.
      function iterator(obj, iteratee, memo, keys, index, length) {
        for (; index >= 0 && index < length; index += dir) {
          var currentKey = keys ? keys[index] : index;
          memo = iteratee(memo, obj[currentKey], currentKey, obj);
        }
        return memo;
      }

      return function(obj, iteratee, memo, context) {
        iteratee = optimizeCb(iteratee, context, 4);
        var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
        // Determine the initial value if none is provided.
        if (arguments.length < 3) {
          memo = obj[keys ? keys[index] : index];
          index += dir;
        }
        return iterator(obj, iteratee, memo, keys, index, length);
      };
    }

    // **Reduce** builds up a single result from a list of values, aka `inject`,
    // or `foldl`.
    _.reduce = _.foldl = _.inject = createReduce(1);

    // The right-associative version of reduce, also known as `foldr`.
    _.reduceRight = _.foldr = createReduce(-1);

    // Return the first value which passes a truth test. Aliased as `detect`.
    _.find = _.detect = function(obj, predicate, context) {
      var key;
      if (isArrayLike(obj)) {
        key = _.findIndex(obj, predicate, context);
      } else {
        key = _.findKey(obj, predicate, context);
      }
      if (key !== void 0 && key !== -1) return obj[key];
    };

    // Return all the elements that pass a truth test.
    // Aliased as `select`.
    _.filter = _.select = function(obj, predicate, context) {
      var results = [];
      predicate = cb(predicate, context);
      _.each(obj, function(value, index, list) {
        if (predicate(value, index, list)) results.push(value);
      });
      return results;
    };

    // Return all the elements for which a truth test fails.
    _.reject = function(obj, predicate, context) {
      return _.filter(obj, _.negate(cb(predicate)), context);
    };

    // Determine whether all of the elements match a truth test.
    // Aliased as `all`.
    _.every = _.all = function(obj, predicate, context) {
      predicate = cb(predicate, context);
      var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
      for (var index = 0; index < length; index++) {
        var currentKey = keys ? keys[index] : index;
        if (!predicate(obj[currentKey], currentKey, obj)) return false;
      }
      return true;
    };

    // Determine if at least one element in the object matches a truth test.
    // Aliased as `any`.
    _.some = _.any = function(obj, predicate, context) {
      predicate = cb(predicate, context);
      var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
      for (var index = 0; index < length; index++) {
        var currentKey = keys ? keys[index] : index;
        if (predicate(obj[currentKey], currentKey, obj)) return true;
      }
      return false;
    };

    // Determine if the array or object contains a given value (using `===`).
    // Aliased as `includes` and `include`.
    _.contains = _.includes = _.include = function(obj, target) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return _.indexOf(obj, target) >= 0;
    };

    // Invoke a method (with arguments) on every item in a collection.
    _.invoke = function(obj, method) {
      var args = slice.call(arguments, 2);
      var isFunc = _.isFunction(method);
      return _.map(obj, function(value) {
        var func = isFunc ? method : value[method];
        return func == null ? func : func.apply(value, args);
      });
    };

    // Convenience version of a common use case of `map`: fetching a property.
    _.pluck = function(obj, key) {
      return _.map(obj, _.property(key));
    };

    // Convenience version of a common use case of `filter`: selecting only objects
    // containing specific `key:value` pairs.
    _.where = function(obj, attrs) {
      return _.filter(obj, _.matcher(attrs));
    };

    // Convenience version of a common use case of `find`: getting the first object
    // containing specific `key:value` pairs.
    _.findWhere = function(obj, attrs) {
      return _.find(obj, _.matcher(attrs));
    };

    // Return the maximum element (or element-based computation).
    _.max = function(obj, iteratee, context) {
      var result = -Infinity, lastComputed = -Infinity,
        value, computed;
      if (iteratee == null && obj != null) {
        obj = isArrayLike(obj) ? obj : _.values(obj);
        for (var i = 0, length = obj.length; i < length; i++) {
          value = obj[i];
          if (value > result) {
            result = value;
          }
        }
      } else {
        iteratee = cb(iteratee, context);
        _.each(obj, function(value, index, list) {
          computed = iteratee(value, index, list);
          if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
            result = value;
            lastComputed = computed;
          }
        });
      }
      return result;
    };

    // Return the minimum element (or element-based computation).
    _.min = function(obj, iteratee, context) {
      var result = Infinity, lastComputed = Infinity,
        value, computed;
      if (iteratee == null && obj != null) {
        obj = isArrayLike(obj) ? obj : _.values(obj);
        for (var i = 0, length = obj.length; i < length; i++) {
          value = obj[i];
          if (value < result) {
            result = value;
          }
        }
      } else {
        iteratee = cb(iteratee, context);
        _.each(obj, function(value, index, list) {
          computed = iteratee(value, index, list);
          if (computed < lastComputed || computed === Infinity && result === Infinity) {
            result = value;
            lastComputed = computed;
          }
        });
      }
      return result;
    };

    // Shuffle a collection, using the modern version of the
    // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
    _.shuffle = function(obj) {
      var set = isArrayLike(obj) ? obj : _.values(obj);
      var length = set.length;
      var shuffled = Array(length);
      for (var index = 0, rand; index < length; index++) {
        rand = _.random(0, index);
        if (rand !== index) shuffled[index] = shuffled[rand];
        shuffled[rand] = set[index];
      }
      return shuffled;
    };

    // Sample **n** random values from a collection.
    // If **n** is not specified, returns a single random element.
    // The internal `guard` argument allows it to work with `map`.
    _.sample = function(obj, n, guard) {
      if (n == null || guard) {
        if (!isArrayLike(obj)) obj = _.values(obj);
        return obj[_.random(obj.length - 1)];
      }
      return _.shuffle(obj).slice(0, Math.max(0, n));
    };

    // Sort the object's values by a criterion produced by an iteratee.
    _.sortBy = function(obj, iteratee, context) {
      iteratee = cb(iteratee, context);
      return _.pluck(_.map(obj, function(value, index, list) {
        return {
          value: value,
          index: index,
          criteria: iteratee(value, index, list)
        };
      }).sort(function(left, right) {
        var a = left.criteria;
        var b = right.criteria;
        if (a !== b) {
          if (a > b || a === void 0) return 1;
          if (a < b || b === void 0) return -1;
        }
        return left.index - right.index;
      }), 'value');
    };

    // An internal function used for aggregate "group by" operations.
    var group = function(behavior) {
      return function(obj, iteratee, context) {
        var result = {};
        iteratee = cb(iteratee, context);
        _.each(obj, function(value, index) {
          var key = iteratee(value, index, obj);
          behavior(result, value, key);
        });
        return result;
      };
    };

    // Groups the object's values by a criterion. Pass either a string attribute
    // to group by, or a function that returns the criterion.
    _.groupBy = group(function(result, value, key) {
      if (_.has(result, key)) result[key].push(value); else result[key] = [value];
    });

    // Indexes the object's values by a criterion, similar to `groupBy`, but for
    // when you know that your index values will be unique.
    _.indexBy = group(function(result, value, key) {
      result[key] = value;
    });

    // Counts instances of an object that group by a certain criterion. Pass
    // either a string attribute to count by, or a function that returns the
    // criterion.
    _.countBy = group(function(result, value, key) {
      if (_.has(result, key)) result[key]++; else result[key] = 1;
    });

    // Safely create a real, live array from anything iterable.
    _.toArray = function(obj) {
      if (!obj) return [];
      if (_.isArray(obj)) return slice.call(obj);
      if (isArrayLike(obj)) return _.map(obj, _.identity);
      return _.values(obj);
    };

    // Return the number of elements in an object.
    _.size = function(obj) {
      if (obj == null) return 0;
      return isArrayLike(obj) ? obj.length : _.keys(obj).length;
    };

    // Split a collection into two arrays: one whose elements all satisfy the given
    // predicate, and one whose elements all do not satisfy the predicate.
    _.partition = function(obj, predicate, context) {
      predicate = cb(predicate, context);
      var pass = [], fail = [];
      _.each(obj, function(value, key, obj) {
        (predicate(value, key, obj) ? pass : fail).push(value);
      });
      return [pass, fail];
    };

    // Array Functions
    // ---------------

    // Get the first element of an array. Passing **n** will return the first N
    // values in the array. Aliased as `head` and `take`. The **guard** check
    // allows it to work with `_.map`.
    _.first = _.head = _.take = function(array, n, guard) {
      if (array == null) return void 0;
      if (n == null || guard) return array[0];
      return _.initial(array, array.length - n);
    };

    // Returns everything but the last entry of the array. Especially useful on
    // the arguments object. Passing **n** will return all the values in
    // the array, excluding the last N.
    _.initial = function(array, n, guard) {
      return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
    };

    // Get the last element of an array. Passing **n** will return the last N
    // values in the array.
    _.last = function(array, n, guard) {
      if (array == null) return void 0;
      if (n == null || guard) return array[array.length - 1];
      return _.rest(array, Math.max(0, array.length - n));
    };

    // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
    // Especially useful on the arguments object. Passing an **n** will return
    // the rest N values in the array.
    _.rest = _.tail = _.drop = function(array, n, guard) {
      return slice.call(array, n == null || guard ? 1 : n);
    };

    // Trim out all falsy values from an array.
    _.compact = function(array) {
      return _.filter(array, _.identity);
    };

    // Internal implementation of a recursive `flatten` function.
    var flatten = function(input, shallow, strict, startIndex) {
      var output = [], idx = 0;
      for (var i = startIndex || 0, length = input && input.length; i < length; i++) {
        var value = input[i];
        if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
          //flatten current level of array or arguments object
          if (!shallow) value = flatten(value, shallow, strict);
          var j = 0, len = value.length;
          output.length += len;
          while (j < len) {
            output[idx++] = value[j++];
          }
        } else if (!strict) {
          output[idx++] = value;
        }
      }
      return output;
    };

    // Flatten out an array, either recursively (by default), or just one level.
    _.flatten = function(array, shallow) {
      return flatten(array, shallow, false);
    };

    // Return a version of the array that does not contain the specified value(s).
    _.without = function(array) {
      return _.difference(array, slice.call(arguments, 1));
    };

    // Produce a duplicate-free version of the array. If the array has already
    // been sorted, you have the option of using a faster algorithm.
    // Aliased as `unique`.
    _.uniq = _.unique = function(array, isSorted, iteratee, context) {
      if (array == null) return [];
      if (!_.isBoolean(isSorted)) {
        context = iteratee;
        iteratee = isSorted;
        isSorted = false;
      }
      if (iteratee != null) iteratee = cb(iteratee, context);
      var result = [];
      var seen = [];
      for (var i = 0, length = array.length; i < length; i++) {
        var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
        if (isSorted) {
          if (!i || seen !== computed) result.push(value);
          seen = computed;
        } else if (iteratee) {
          if (!_.contains(seen, computed)) {
            seen.push(computed);
            result.push(value);
          }
        } else if (!_.contains(result, value)) {
          result.push(value);
        }
      }
      return result;
    };

    // Produce an array that contains the union: each distinct element from all of
    // the passed-in arrays.
    _.union = function() {
      return _.uniq(flatten(arguments, true, true));
    };

    // Produce an array that contains every item shared between all the
    // passed-in arrays.
    _.intersection = function(array) {
      if (array == null) return [];
      var result = [];
      var argsLength = arguments.length;
      for (var i = 0, length = array.length; i < length; i++) {
        var item = array[i];
        if (_.contains(result, item)) continue;
        for (var j = 1; j < argsLength; j++) {
          if (!_.contains(arguments[j], item)) break;
        }
        if (j === argsLength) result.push(item);
      }
      return result;
    };

    // Take the difference between one array and a number of other arrays.
    // Only the elements present in just the first array will remain.
    _.difference = function(array) {
      var rest = flatten(arguments, true, true, 1);
      return _.filter(array, function(value) {
        return !_.contains(rest, value);
      });
    };

    // Zip together multiple lists into a single array -- elements that share
    // an index go together.
    _.zip = function() {
      return _.unzip(arguments);
    };

    // Complement of _.zip. Unzip accepts an array of arrays and groups
    // each array's elements on shared indices
    _.unzip = function(array) {
      var length = array && _.max(array, 'length').length || 0;
      var result = Array(length);

      for (var index = 0; index < length; index++) {
        result[index] = _.pluck(array, index);
      }
      return result;
    };

    // Converts lists into objects. Pass either a single array of `[key, value]`
    // pairs, or two parallel arrays of the same length -- one of keys, and one of
    // the corresponding values.
    _.object = function(list, values) {
      var result = {};
      for (var i = 0, length = list && list.length; i < length; i++) {
        if (values) {
          result[list[i]] = values[i];
        } else {
          result[list[i][0]] = list[i][1];
        }
      }
      return result;
    };

    // Return the position of the first occurrence of an item in an array,
    // or -1 if the item is not included in the array.
    // If the array is large and already in sort order, pass `true`
    // for **isSorted** to use binary search.
    _.indexOf = function(array, item, isSorted) {
      var i = 0, length = array && array.length;
      if (typeof isSorted == 'number') {
        i = isSorted < 0 ? Math.max(0, length + isSorted) : isSorted;
      } else if (isSorted && length) {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
      if (item !== item) {
        return _.findIndex(slice.call(array, i), _.isNaN);
      }
      for (; i < length; i++) if (array[i] === item) return i;
      return -1;
    };

    _.lastIndexOf = function(array, item, from) {
      var idx = array ? array.length : 0;
      if (typeof from == 'number') {
        idx = from < 0 ? idx + from + 1 : Math.min(idx, from + 1);
      }
      if (item !== item) {
        return _.findLastIndex(slice.call(array, 0, idx), _.isNaN);
      }
      while (--idx >= 0) if (array[idx] === item) return idx;
      return -1;
    };

    // Generator function to create the findIndex and findLastIndex functions
    function createIndexFinder(dir) {
      return function(array, predicate, context) {
        predicate = cb(predicate, context);
        var length = array != null && array.length;
        var index = dir > 0 ? 0 : length - 1;
        for (; index >= 0 && index < length; index += dir) {
          if (predicate(array[index], index, array)) return index;
        }
        return -1;
      };
    }

    // Returns the first index on an array-like that passes a predicate test
    _.findIndex = createIndexFinder(1);

    _.findLastIndex = createIndexFinder(-1);

    // Use a comparator function to figure out the smallest index at which
    // an object should be inserted so as to maintain order. Uses binary search.
    _.sortedIndex = function(array, obj, iteratee, context) {
      iteratee = cb(iteratee, context, 1);
      var value = iteratee(obj);
      var low = 0, high = array.length;
      while (low < high) {
        var mid = Math.floor((low + high) / 2);
        if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
      }
      return low;
    };

    // Generate an integer Array containing an arithmetic progression. A port of
    // the native Python `range()` function. See
    // [the Python documentation](http://docs.python.org/library/functions.html#range).
    _.range = function(start, stop, step) {
      if (arguments.length <= 1) {
        stop = start || 0;
        start = 0;
      }
      step = step || 1;

      var length = Math.max(Math.ceil((stop - start) / step), 0);
      var range = Array(length);

      for (var idx = 0; idx < length; idx++, start += step) {
        range[idx] = start;
      }

      return range;
    };

    // Function (ahem) Functions
    // ------------------

    // Determines whether to execute a function as a constructor
    // or a normal function with the provided arguments
    var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
      if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
      var self = baseCreate(sourceFunc.prototype);
      var result = sourceFunc.apply(self, args);
      if (_.isObject(result)) return result;
      return self;
    };

    // Create a function bound to a given object (assigning `this`, and arguments,
    // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
    // available.
    _.bind = function(func, context) {
      if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
      if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
      var args = slice.call(arguments, 2);
      return function bound() {
        return executeBound(func, bound, context, this, args.concat(slice.call(arguments)));
      };
    };

    // Partially apply a function by creating a version that has had some of its
    // arguments pre-filled, without changing its dynamic `this` context. _ acts
    // as a placeholder, allowing any combination of arguments to be pre-filled.
    _.partial = function(func) {
      var boundArgs = slice.call(arguments, 1);
      return function bound() {
        var position = 0, length = boundArgs.length;
        var args = Array(length);
        for (var i = 0; i < length; i++) {
          args[i] = boundArgs[i] === _ ? arguments[position++] : boundArgs[i];
        }
        while (position < arguments.length) args.push(arguments[position++]);
        return executeBound(func, bound, this, this, args);
      };
    };

    // Bind a number of an object's methods to that object. Remaining arguments
    // are the method names to be bound. Useful for ensuring that all callbacks
    // defined on an object belong to it.
    _.bindAll = function(obj) {
      var i, length = arguments.length, key;
      if (length <= 1) throw new Error('bindAll must be passed function names');
      for (i = 1; i < length; i++) {
        key = arguments[i];
        obj[key] = _.bind(obj[key], obj);
      }
      return obj;
    };

    // Memoize an expensive function by storing its results.
    _.memoize = function(func, hasher) {
      var memoize = function(key) {
        var cache = memoize.cache;
        var address = `${hasher ? hasher.apply(this, arguments) : key}`;
        if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
        return cache[address];
      };
      memoize.cache = {};
      return memoize;
    };

    // Delays a function for the given number of milliseconds, and then calls
    // it with the arguments supplied.
    _.delay = function(func, wait) {
      var args = slice.call(arguments, 2);
      return setTimeout(function() {
        return func.apply(null, args);
      }, wait);
    };

    // Defers a function, scheduling it to run after the current call stack has
    // cleared.
    _.defer = _.partial(_.delay, _, 1);

    // Returns a function, that, when invoked, will only be triggered at most once
    // during a given window of time. Normally, the throttled function will run
    // as much as it can, without ever going more than once per `wait` duration;
    // but if you'd like to disable the execution on the leading edge, pass
    // `{leading: false}`. To disable execution on the trailing edge, ditto.
    _.throttle = function(func, wait, options) {
      var context, args, result;
      var timeout = null;
      var previous = 0;
      if (!options) options = {};
      var later = function() {
        previous = options.leading === false ? 0 : _.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      };
      return function() {
        var now = _.now();
        if (!previous && options.leading === false) previous = now;
        var remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if (remaining <= 0 || remaining > wait) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          previous = now;
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        } else if (!timeout && options.trailing !== false) {
          timeout = setTimeout(later, remaining);
        }
        return result;
      };
    };

    // Returns a function, that, as long as it continues to be invoked, will not
    // be triggered. The function will be called after it stops being called for
    // N milliseconds. If `immediate` is passed, trigger the function on the
    // leading edge, instead of the trailing.
    _.debounce = function(func, wait, immediate) {
      var timeout, args, context, timestamp, result;

      var later = function() {
        var last = _.now() - timestamp;

        if (last < wait && last >= 0) {
          timeout = setTimeout(later, wait - last);
        } else {
          timeout = null;
          if (!immediate) {
            result = func.apply(context, args);
            if (!timeout) context = args = null;
          }
        }
      };

      return function() {
        context = this;
        args = arguments;
        timestamp = _.now();
        var callNow = immediate && !timeout;
        if (!timeout) timeout = setTimeout(later, wait);
        if (callNow) {
          result = func.apply(context, args);
          context = args = null;
        }

        return result;
      };
    };

    // Returns the first function passed as an argument to the second,
    // allowing you to adjust arguments, run code before and after, and
    // conditionally execute the original function.
    _.wrap = function(func, wrapper) {
      return _.partial(wrapper, func);
    };

    // Returns a negated version of the passed-in predicate.
    _.negate = function(predicate) {
      return function() {
        return !predicate.apply(this, arguments);
      };
    };

    // Returns a function that is the composition of a list of functions, each
    // consuming the return value of the function that follows.
    _.compose = function() {
      var args = arguments;
      var start = args.length - 1;
      return function() {
        var i = start;
        var result = args[start].apply(this, arguments);
        while (i--) result = args[i].call(this, result);
        return result;
      };
    };

    // Returns a function that will only be executed on and after the Nth call.
    _.after = function(times, func) {
      return function() {
        if (--times < 1) {
          return func.apply(this, arguments);
        }
      };
    };

    // Returns a function that will only be executed up to (but not including) the Nth call.
    _.before = function(times, func) {
      var memo;
      return function() {
        if (--times > 0) {
          memo = func.apply(this, arguments);
        }
        if (times <= 1) func = null;
        return memo;
      };
    };

    // Returns a function that will be executed at most one time, no matter how
    // often you call it. Useful for lazy initialization.
    _.once = _.partial(_.before, 2);

    // Object Functions
    // ----------------

    // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
    var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
    var nonEnumerableProps = ['constructor', 'valueOf', 'isPrototypeOf', 'toString',
      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

    function collectNonEnumProps(obj, keys) {
      var nonEnumIdx = nonEnumerableProps.length;
      var proto = typeof obj.constructor === 'function' ? FuncProto : ObjProto;

      while (nonEnumIdx--) {
        var prop = nonEnumerableProps[nonEnumIdx];
        if (prop === 'constructor' ? _.has(obj, prop) : prop in obj &&
          obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
          keys.push(prop);
        }
      }
    }

    // Retrieve the names of an object's own properties.
    // Delegates to **ECMAScript 5**'s native `Object.keys`
    _.keys = function(obj) {
      if (!_.isObject(obj)) return [];
      if (nativeKeys) return nativeKeys(obj);
      var keys = [];
      for (var key in obj) if (_.has(obj, key)) keys.push(key);
      // Ahem, IE < 9.
      if (hasEnumBug) collectNonEnumProps(obj, keys);
      return keys;
    };

    // Retrieve all the property names of an object.
    _.allKeys = function(obj) {
      if (!_.isObject(obj)) return [];
      var keys = [];
      for (var key in obj) keys.push(key);
      // Ahem, IE < 9.
      if (hasEnumBug) collectNonEnumProps(obj, keys);
      return keys;
    };

    // Retrieve the values of an object's properties.
    _.values = function(obj) {
      var keys = _.keys(obj);
      var length = keys.length;
      var values = Array(length);
      for (var i = 0; i < length; i++) {
        values[i] = obj[keys[i]];
      }
      return values;
    };

    // Returns the results of applying the iteratee to each element of the object
    // In contrast to _.map it returns an object
    _.mapObject = function(obj, iteratee, context) {
      iteratee = cb(iteratee, context);
      var keys =  _.keys(obj),
        length = keys.length,
        results = {},
        currentKey;
      for (var index = 0; index < length; index++) {
        currentKey = keys[index];
        results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
      }
      return results;
    };

    // Convert an object into a list of `[key, value]` pairs.
    _.pairs = function(obj) {
      var keys = _.keys(obj);
      var length = keys.length;
      var pairs = Array(length);
      for (var i = 0; i < length; i++) {
        pairs[i] = [keys[i], obj[keys[i]]];
      }
      return pairs;
    };

    // Invert the keys and values of an object. The values must be serializable.
    _.invert = function(obj) {
      var result = {};
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        result[obj[keys[i]]] = keys[i];
      }
      return result;
    };

    // Return a sorted list of the function names available on the object.
    // Aliased as `methods`
    _.functions = _.methods = function(obj) {
      var names = [];
      for (var key in obj) {
        if (_.isFunction(obj[key])) names.push(key);
      }
      return names.sort();
    };

    // Extend a given object with all the properties in passed-in object(s).
    _.extend = createAssigner(_.allKeys);

    // Assigns a given object with all the own properties in the passed-in object(s)
    // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
    _.extendOwn = createAssigner(_.keys);

    // Returns the first key on an object that passes a predicate test
    _.findKey = function(obj, predicate, context) {
      predicate = cb(predicate, context);
      var keys = _.keys(obj), key;
      for (var i = 0, length = keys.length; i < length; i++) {
        key = keys[i];
        if (predicate(obj[key], key, obj)) return key;
      }
    };

    // Return a copy of the object only containing the whitelisted properties.
    _.pick = function(obj, iteratee, context) {
      var result = {}, key;
      if (obj == null) return result;
      if (_.isFunction(iteratee)) {
        iteratee = optimizeCb(iteratee, context);
        for (key in obj) {
          var value = obj[key];
          if (iteratee(value, key, obj)) result[key] = value;
        }
      } else {
        var keys = flatten(arguments, false, false, 1);
        obj = new Object(obj);
        for (var i = 0, length = keys.length; i < length; i++) {
          key = keys[i];
          if (key in obj) result[key] = obj[key];
        }
      }
      return result;
    };

    // Return a copy of the object without the blacklisted properties.
    _.omit = function(obj, iteratee, context) {
      if (_.isFunction(iteratee)) {
        iteratee = _.negate(iteratee);
      } else {
        var keys = _.map(flatten(arguments, false, false, 1), String);
        iteratee = function(value, key) {
          return !_.contains(keys, key);
        };
      }
      return _.pick(obj, iteratee, context);
    };

    // Fill in a given object with default properties.
    _.defaults = createAssigner(_.allKeys, true);

    // Create a (shallow-cloned) duplicate of an object.
    _.clone = function(obj) {
      if (!_.isObject(obj)) return obj;
      return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
    };

    // Invokes interceptor with the obj, and then returns obj.
    // The primary purpose of this method is to "tap into" a method chain, in
    // order to perform operations on intermediate results within the chain.
    _.tap = function(obj, interceptor) {
      interceptor(obj);
      return obj;
    };

    // Returns whether an object has a given set of `key:value` pairs.
    _.isMatch = function(object, attrs) {
      var keys = _.keys(attrs), length = keys.length;
      if (object == null) return !length;
      var obj = Object(object);
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        if (attrs[key] !== obj[key] || !(key in obj)) return false;
      }
      return true;
    };


    // Internal recursive comparison function for `isEqual`.
    var eq = function(a, b, aStack, bStack) {
      // Identical objects are equal. `0 === -0`, but they aren't identical.
      // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
      if (a === b) return a !== 0 || 1 / a === 1 / b;
      // A strict comparison is necessary because `null == undefined`.
      if (a == null || b == null) return a === b;
      // Unwrap any wrapped objects.
      if (a instanceof _) a = a._wrapped;
      if (b instanceof _) b = b._wrapped;
      // Compare `[[Class]]` names.
      var className = toString.call(a);
      if (className !== toString.call(b)) return false;
      switch (className) {
        // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
        // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
          // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
          // equivalent to `new String("5")`.
        return `${a}` === `${b}`;
      case '[object Number]':
          // `NaN`s are equivalent, but non-reflexive.
          // Object(NaN) is equivalent to NaN
        if (+a !== +a) return +b !== +b;
          // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
          // Coerce dates and booleans to numeric primitive values. Dates are compared by their
          // millisecond representations. Note that invalid dates with millisecond representations
          // of `NaN` are not equivalent.
        return +a === +b;
      }

      var areArrays = className === '[object Array]';
      if (!areArrays) {
        if (typeof a != 'object' || typeof b != 'object') return false;

        // Objects with different constructors are not equivalent, but `Object`s or `Array`s
        // from different frames are.
        var aCtor = a.constructor, bCtor = b.constructor;
        if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
          _.isFunction(bCtor) && bCtor instanceof bCtor)
          && ('constructor' in a && 'constructor' in b)) {
          return false;
        }
      }
      // Assume equality for cyclic structures. The algorithm for detecting cyclic
      // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

      // Initializing stack of traversed objects.
      // It's done here since we only need them for objects and arrays comparison.
      aStack = aStack || [];
      bStack = bStack || [];
      var length = aStack.length;
      while (length--) {
        // Linear search. Performance is inversely proportional to the number of
        // unique nested structures.
        if (aStack[length] === a) return bStack[length] === b;
      }

      // Add the first object to the stack of traversed objects.
      aStack.push(a);
      bStack.push(b);

      // Recursively compare objects and arrays.
      if (areArrays) {
        // Compare array lengths to determine if a deep comparison is necessary.
        length = a.length;
        if (length !== b.length) return false;
        // Deep compare the contents, ignoring non-numeric properties.
        while (length--) {
          if (!eq(a[length], b[length], aStack, bStack)) return false;
        }
      } else {
        // Deep compare objects.
        var keys = _.keys(a), key;
        length = keys.length;
        // Ensure that both objects contain the same number of properties before comparing deep equality.
        if (_.keys(b).length !== length) return false;
        while (length--) {
          // Deep compare each member
          key = keys[length];
          if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
        }
      }
      // Remove the first object from the stack of traversed objects.
      aStack.pop();
      bStack.pop();
      return true;
    };

    // Perform a deep comparison to check if two objects are equal.
    _.isEqual = function(a, b) {
      return eq(a, b);
    };

    // Is a given array, string, or object empty?
    // An "empty" object has no enumerable own-properties.
    _.isEmpty = function(obj) {
      if (obj == null) return true;
      if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
      return _.keys(obj).length === 0;
    };

    // Is a given value a DOM element?
    _.isElement = function(obj) {
      return !!(obj && obj.nodeType === 1);
    };

    // Is a given value an array?
    // Delegates to ECMA5's native Array.isArray
    _.isArray = nativeIsArray || function(obj) {
      return toString.call(obj) === '[object Array]';
    };

    // Is a given variable an object?
    _.isObject = function(obj) {
      var type = typeof obj;
      return type === 'function' || type === 'object' && !!obj;
    };

    // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError.
    _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error'], function(name) {
      _[`is${name}`] = function(obj) {
        return toString.call(obj) === `[object ${name}]`;
      };
    });

    // Define a fallback version of the method in browsers (ahem, IE < 9), where
    // there isn't any inspectable "Arguments" type.
    if (!_.isArguments(arguments)) {
      _.isArguments = function(obj) {
        return _.has(obj, 'callee');
      };
    }

    // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
    // IE 11 (#1621), and in Safari 8 (#1929).
    if (typeof /./ != 'function' && typeof Int8Array != 'object') {
      _.isFunction = function(obj) {
        return typeof obj == 'function' || false;
      };
    }

    // Is a given object a finite number?
    _.isFinite = function(obj) {
      return isFinite(obj) && !isNaN(parseFloat(obj));
    };

    // Is the given value `NaN`? (NaN is the only number which does not equal itself).
    _.isNaN = function(obj) {
      return _.isNumber(obj) && obj !== +obj;
    };

    // Is a given value a boolean?
    _.isBoolean = function(obj) {
      return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
    };

    // Is a given value equal to null?
    _.isNull = function(obj) {
      return obj === null;
    };

    // Is a given variable undefined?
    _.isUndefined = function(obj) {
      return obj === void 0;
    };

    // Shortcut function for checking if an object has a given property directly
    // on itself (in other words, not on a prototype).
    _.has = function(obj, key) {
      return obj != null && hasOwnProperty.call(obj, key);
    };

    // Utility Functions
    // -----------------

    // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
    // previous owner. Returns a reference to the Underscore object.
    _.noConflict = function() {
      root._ = previousUnderscore;
      return this;
    };

    // Keep the identity function around for default iteratees.
    _.identity = function(value) {
      return value;
    };

    // Predicate-generating functions. Often useful outside of Underscore.
    _.constant = function(value) {
      return function() {
        return value;
      };
    };

    _.noop = function() {};

    _.property = function(key) {
      return function(obj) {
        return obj == null ? void 0 : obj[key];
      };
    };

    // Generates a function for a given object that returns a given property.
    _.propertyOf = function(obj) {
      return obj == null ? function() {} : function(key) {
        return obj[key];
      };
    };

    // Returns a predicate for checking whether an object has a given set of
    // `key:value` pairs.
    _.matcher = _.matches = function(attrs) {
      attrs = _.extendOwn({}, attrs);
      return function(obj) {
        return _.isMatch(obj, attrs);
      };
    };

    // Run a function **n** times.
    _.times = function(n, iteratee, context) {
      var accum = Array(Math.max(0, n));
      iteratee = optimizeCb(iteratee, context, 1);
      for (var i = 0; i < n; i++) accum[i] = iteratee(i);
      return accum;
    };

    // Return a random integer between min and max (inclusive).
    _.random = function(min, max) {
      if (max == null) {
        max = min;
        min = 0;
      }
      return min + Math.floor(Math.random() * (max - min + 1));
    };

    // A (possibly faster) way to get the current timestamp as an integer.
    _.now = Date.now || function() {
      return new Date().getTime();
    };

    // List of HTML entities for escaping.
    var escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '`': '&#x60;'
    };
    var unescapeMap = _.invert(escapeMap);

    // Functions for escaping and unescaping strings to/from HTML interpolation.
    var createEscaper = function(map) {
      var escaper = function(match) {
        return map[match];
      };
      // Regexes for identifying a key that needs to be escaped
      var source = `(?:${_.keys(map).join('|')})`;
      var testRegexp = RegExp(source);
      var replaceRegexp = RegExp(source, 'g');
      return function(string) {
        string = string == null ? '' : `${string}`;
        return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
      };
    };
    _.escape = createEscaper(escapeMap);
    _.unescape = createEscaper(unescapeMap);

    // If the value of the named `property` is a function then invoke it with the
    // `object` as context; otherwise, return it.
    _.result = function(object, property, fallback) {
      var value = object == null ? void 0 : object[property];
      if (value === void 0) {
        value = fallback;
      }
      return _.isFunction(value) ? value.call(object) : value;
    };

    // Generate a unique integer id (unique within the entire client session).
    // Useful for temporary DOM ids.
    var idCounter = 0;
    _.uniqueId = function(prefix) {
      var id = `${++idCounter}`;
      return prefix ? prefix + id : id;
    };

    // By default, Underscore uses ERB-style template delimiters, change the
    // following template settings to use alternative delimiters.
    _.templateSettings = {
      evaluate    : /<%([\s\S]+?)%>/g,
      interpolate : /<%=([\s\S]+?)%>/g,
      escape      : /<%-([\s\S]+?)%>/g
    };

    // When customizing `templateSettings`, if you don't want to define an
    // interpolation, evaluation or escaping regex, we need one that is
    // guaranteed not to match.
    var noMatch = /(.)^/;

    // Certain characters need to be escaped so that they can be put into a
    // string literal.
    var escapes = {
      "'":      "'",
      '\\':     '\\',
      '\r':     'r',
      '\n':     'n',
      '\u2028': 'u2028',
      '\u2029': 'u2029'
    };

    var escaper = /\\|'|\r|\n|\u2028|\u2029/g;

    var escapeChar = function(match) {
      return `\\${escapes[match]}`;
    };

    // JavaScript micro-templating, similar to John Resig's implementation.
    // Underscore templating handles arbitrary delimiters, preserves whitespace,
    // and correctly escapes quotes within interpolated code.
    // NB: `oldSettings` only exists for backwards compatibility.
    _.template = function(text, settings, oldSettings) {
      if (!settings && oldSettings) settings = oldSettings;
      settings = _.defaults({}, settings, _.templateSettings);

      // Combine delimiters into one regular expression via alternation.
      var matcher = RegExp(`${[
        (settings.escape || noMatch).source,
        (settings.interpolate || noMatch).source,
        (settings.evaluate || noMatch).source
      ].join('|')}|$`, 'g');

      // Compile the template source, escaping string literals appropriately.
      var index = 0;
      var source = "__p+='";
      text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
        source += text.slice(index, offset).replace(escaper, escapeChar);
        index = offset + match.length;

        if (escape) {
          source += `'+\n((__t=(${escape}))==null?'':_.escape(__t))+\n'`;
        } else if (interpolate) {
          source += `'+\n((__t=(${interpolate}))==null?'':__t)+\n'`;
        } else if (evaluate) {
          source += `';\n${evaluate}\n__p+='`;
        }

        // Adobe VMs need the match returned to produce the correct offest.
        return match;
      });
      source += "';\n";

      // If a variable is not specified, place data values in local scope.
      if (!settings.variable) source = `with(obj||{}){\n${source}}\n`;

      source = `${"var __t,__p='',__j=Array.prototype.join," +
        "print=function(){__p+=__j.call(arguments,'');};\n"}${
        source}return __p;\n`;

      try {
        var render = new Function(settings.variable || 'obj', '_', source);
      } catch (e) {
        e.source = source;
        throw e;
      }

      var template = function(data) {
        return render.call(this, data, _);
      };

      // Provide the compiled source as a convenience for precompilation.
      var argument = settings.variable || 'obj';
      template.source = `function(${argument}){\n${source}}`;

      return template;
    };

    // Add a "chain" function. Start chaining a wrapped Underscore object.
    _.chain = function(obj) {
      var instance = _(obj);
      instance._chain = true;
      return instance;
    };

    // OOP
    // ---------------
    // If Underscore is called as a function, it returns a wrapped object that
    // can be used OO-style. This wrapper holds altered versions of all the
    // underscore functions. Wrapped objects may be chained.

    // Helper function to continue chaining intermediate results.
    var result = function(instance, obj) {
      return instance._chain ? _(obj).chain() : obj;
    };

    // Add your own custom functions to the Underscore object.
    _.mixin = function(obj) {
      _.each(_.functions(obj), function(name) {
        var func = _[name] = obj[name];
        _.prototype[name] = function() {
          var args = [this._wrapped];
          push.apply(args, arguments);
          return result(this, func.apply(_, args));
        };
      });
    };

    // Add all of the Underscore functions to the wrapper object.
    _.mixin(_);

    // Add all mutator Array functions to the wrapper.
    _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
      var method = ArrayProto[name];
      _.prototype[name] = function() {
        var obj = this._wrapped;
        method.apply(obj, arguments);
        if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
        return result(this, obj);
      };
    });

    // Add all accessor Array functions to the wrapper.
    _.each(['concat', 'join', 'slice'], function(name) {
      var method = ArrayProto[name];
      _.prototype[name] = function() {
        return result(this, method.apply(this._wrapped, arguments));
      };
    });

    // Extracts the result from a wrapped and chained object.
    _.prototype.value = function() {
      return this._wrapped;
    };

    // Provide unwrapping proxy for some methods used in engine operations
    // such as arithmetic and JSON stringification.
    _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;

    _.prototype.toString = function() {
      return `${this._wrapped}`;
    };

    // AMD registration happens at the end for compatibility with AMD loaders
    // that may not enforce next-turn semantics on modules. Even though general
    // practice for AMD registration is to be anonymous, underscore registers
    // as a named module because, like jQuery, it is a base library that is
    // popular enough to be bundled in a third party lib, but not be part of
    // an AMD load request. Those cases could generate an error when an
    // anonymous define() is called outside of a loader request.
    if (typeof define === 'function' && define.amd) {
      define('underscore', [], function() {
        return _;
      });
    }
  }.call(this));

},{}]},{},[1]);
