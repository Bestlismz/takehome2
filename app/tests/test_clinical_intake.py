from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from clinical_intake import validate_medication_draft, validate_blood_pressure_display
import server

class ClinicalIntake(unittest.TestCase):
    def test_incomplete_medicine_remains_uncertain_and_never_activates(self):
        draft=validate_medication_draft({'medications':[{'name':'Example medicine','dose':'','instructions':'after food','uncertain':False}],'uncertainties':[]})
        self.assertTrue(draft['medications'][0]['uncertain'])
        self.assertNotIn('approved',draft)
    def test_display_reading_requires_visible_complete_unambiguous_numbers(self):
        sample={'visible':True,'systolic':128,'diastolic':78,'pulse':72,'unit':'mmHg','uncertainties':[]}
        self.assertEqual(validate_blood_pressure_display(sample)['systolic'],128)
        self.assertEqual(validate_blood_pressure_display({**sample,'systolic':16,'diastolic':10,'unit':'kPa'})['systolic'],120)
        for patch_value in [{'visible':False},{'systolic':None},{'uncertainties':['unclear']},{'diastolic':140},{'pulse':True},{'unit':None}]:
            with self.assertRaises(ValueError):validate_blood_pressure_display({**sample,**patch_value})
    def test_no_document_or_workspace_never_contacts_ai(self):
        with patch.object(server,'structured_response') as ai:
            for path in ['/api/medication-document','/api/blood-pressure-display']:
                with self.assertRaises(server.RequestError):server.handle_api(path,{},None)
                with self.assertRaises(server.RequestError):server.handle_api(path,{},'fixture-workspace')
            ai.assert_not_called()
