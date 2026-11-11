"""Проверки разбора вложенной геометрии и альтернативных записей входов."""
import unittest

from export_island_layout import parse_manifest, render_markdown


ISLAND = '''
export const ISLAND = {
 width: 1000, height: 500, launchOrigin: [100, 50], unitsPerPx: 0.5,
 padCore: {center: [100, 50], radius: 20, trench: [1, 2, 3, 4]},
};
export const BUILDING_ANCHORS = {
 gantry: {
  zone: 'launch_core', anchors: [[200, 100], [240, 100]], size: [80, 60], footprint: [70, 20],
  e0: { anchors: [[210, 110]], size: [40, 30], footprint: [35, 10], lamp: [2.5 / 4, 0.5 / 7] },
 },
};
'''


class ExportTests(unittest.TestCase):
    def test_nested_e0_does_not_replace_general_geometry(self):
        data = parse_manifest(ISLAND)
        general = data['purchases']['gantry']
        self.assertEqual(general['anchors'], [[200, 100], [240, 100]])
        self.assertEqual(general['sprite_px'], [80, 60])
        self.assertEqual(general['footprint_px'], [70, 20])
        self.assertEqual(general['anchors_world'], [[50, 25], [70, 25]])
        self.assertEqual(general['anchors_uv'], [[0.2, 0.2], [0.24, 0.2]])
        self.assertEqual(general['e0']['anchors'], [[210, 110]])
        self.assertEqual(general['e0']['sprite_px'], [40, 30])
        self.assertEqual(general['e0']['footprint_px'], [35, 10])
        self.assertEqual(general['e0']['anchors_world'], [[55, 30]])

    def test_legacy_and_alternative_entry_constants(self):
        for constant in ('WORLD_ENTRIES', 'ENTRY_ANCHORS'):
            with self.subTest(constant=constant):
                text = ISLAND + '''export const NAME = {
                  workshop: { zone: 'launch_core', anchors: [[100, 60]], size: [90, 80],
                   footprint: [70, 30], e0Anchor: [120, 70], e0Scale: 0.3, e0Size: [27, 24] },
                };'''.replace('NAME', constant)
                entry = parse_manifest(text)['entries']['workshop']
                self.assertEqual(entry['anchors'], [[100, 60]])
                self.assertEqual(entry['e0Anchor'], [120, 70])
                self.assertEqual(entry['e0Size'], [27, 24])
                self.assertEqual(entry['e0Scale'], 0.3)

    def test_unknown_required_expression_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_manifest(ISLAND.replace('size: [80, 60]', 'size: calculateSize()'))

    def test_markdown_uses_exported_values(self):
        data = parse_manifest(ISLAND)
        data['source'] = {'sha': 'a' * 40}
        text = render_markdown(data)
        self.assertIn('[[210, 110]] | [40, 30] | [35, 10]', text)
        self.assertIn('a' * 40, text)


if __name__ == '__main__':
    unittest.main()
