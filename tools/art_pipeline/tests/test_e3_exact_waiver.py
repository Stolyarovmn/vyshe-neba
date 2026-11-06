import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import production_guard as pg

class E3WaiverTests(unittest.TestCase):
    def setUp(self):
        self.spec = {'schema_version': 1, 'kind': 'era_reference_sheet', 'era': 'E3', 'year': 2015,
            'role': 'mechanics-infrastructure', 'sheet': '02-joints-guides-handling', 'title': 'test',
            'prompt_file': 'prompt', 'style_bible_file': 'art/style_bible.txt',
            'generation': {'size': [1536,1024], 'layout': [4,2], 'one_role_per_call': True, 'one_era_per_call': True},
            'expected_specimen_count': 8, 'specimens': [{'id':f'{i:02}', 'name':str(i), 'description':'item'} for i in range(1,9)],
            'global_forbidden':['extra'], 'era_contract':{'character':'x','required_signals':['x'],'replaced_previous_language':['x'],'forbidden_regressions':['x']},
            'presentation':{k:True for k in ('isolated_specimens','non_overlapping','neutral_background','no_labels_or_text','no_scenery','no_cast_shadow','no_baked_fx')},
            'archive':{'provider':'google_drive','folder_id':'folder'}}
        self.spec_bytes=json.dumps(self.spec).encode()
        self.expected_spec=hashlib.sha256(self.spec_bytes).hexdigest()
        self.waiver={'id':pg.E3_WAIVER_ID,'source_sha256':pg.E3_WAIVER_SOURCE,'drive_file_id':pg.E3_WAIVER_DRIVE,'spec_sha256':self.expected_spec,'specimen_id':'03','decision':'owner_accepts_unconfirmed_engagement'}
        report={'sha256':pg.E3_WAIVER_SOURCE,'bytes':1730319,'dimensions':[1536,1024], 'dimension_delta_px':[0,0], 'dimension_tolerance_px':1,'technical_verdict':'pass','technical_errors':[]}
        self.review=pg.review_template(self.spec,report,'spec','UNKNOWN_UNAVAILABLE',pg.E3_WAIVER_DRIVE,'https://drive.google.com/file/d/'+pg.E3_WAIVER_DRIVE+'/view')
        self.review['reviewer']='reviewer';self.review['review_method']='visual'
        for k in self.review['global_gates']:self.review['global_gates'][k]='pass'
        for x in self.review['specimens']:x['verdict']='pending' if x['id']=='03' else 'pass'

    def check(self, review=None, image=Path('source.png'), spec_bytes=None, waiver=None, spec=None):
        with patch.object(pg,'E3_WAIVER_SPEC',self.expected_spec), patch.object(pg,'png_info',return_value=(1536,1024,1730319,pg.E3_WAIVER_SOURCE)):
            return pg.validate_review_with_e3_waiver(spec or self.spec, review or self.review, image, waiver or self.waiver, self.spec_bytes if spec_bytes is None else spec_bytes)

    def test_allowed_unchanged_review_and_no_mutation(self):
        original=copy.deepcopy(self.review)
        self.assertEqual([],self.check())
        self.assertEqual(original,self.review)
        self.assertTrue(pg.validate_review(self.spec,self.review))

    def test_fails_closed_for_missing_image_wrong_spec_wrong_waiver_and_other_pending(self):
        self.assertTrue(self.check(image=None))
        self.assertTrue(self.check(spec_bytes=b'changed'))
        bad=copy.deepcopy(self.waiver);bad['source_sha256']='f'*64
        self.assertTrue(self.check(waiver=bad))
        bad=copy.deepcopy(self.review);bad['source']['drive_file_id']='other'
        self.assertTrue(self.check(review=bad))
        bad=copy.deepcopy(self.review);bad['specimens'][0]['verdict']='pending'
        self.assertTrue(self.check(review=bad))
        bad=copy.deepcopy(self.review);bad['global_gates']['style_family']='fail'
        self.assertTrue(self.check(review=bad))
        bad=copy.deepcopy(self.review);bad['specimens'][2]['verdict']='fail'
        self.assertTrue(self.check(review=bad))

if __name__ == '__main__': unittest.main()
